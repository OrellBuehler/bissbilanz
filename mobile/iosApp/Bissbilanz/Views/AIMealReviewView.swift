import SwiftUI

/// Editable review of an `AIMealSheet` estimate before logging, pushed within
/// that sheet's stack (Back returns to the form). Matched items log against
/// the matched food (by servings, falling back to a grams/serving size
/// conversion); everything else logs as a quick entry with the AI's macro
/// estimate. `onLogged` reports how many items were logged so the presenting
/// screen (Dashboard/DayLog) can show its own toast; the sheet tears itself
/// down from that callback.
struct AIMealReviewView: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(FoodRepository.self) private var foodRepository

    let estimate: MealEstimate
    let date: String
    let mealType: String
    var onLogged: (Int) -> Void = { _ in }

    @State private var items: [EditableItem] = []
    @State private var isLogging = false
    @State private var errorMessage: String?

    private struct EditableItem: Identifiable {
        let id = UUID()
        var isIncluded: Bool
        var name: String
        var matchedFood: Food?
        let quantityDescription: String
        let grams: Double?
        let servings: Double?
        var calories: String
        var protein: String
        var carbs: String
        var fat: String
        var fiber: String
        let confidence: Double
    }

    private var includedCount: Int {
        items.filter(\.isIncluded).count
    }

    var body: some View {
        Group {
            if items.isEmpty {
                ContentUnavailableView(L10n.aiMealNoItemsFound, systemImage: "sparkles")
            } else {
                Form {
                    Section {
                        Text(L10n.aiMealDisclaimer)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    ForEach($items) { $item in
                        Section {
                            itemRow($item)
                        }
                    }
                }
                .keyboardDismissable()
            }
        }
        .navigationTitle(L10n.aiMealReviewTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.aiMealLogItems(includedCount)) {
                    Task { await logAll() }
                }
                .disabled(includedCount == 0 || isLogging)
                .fontWeight(.semibold)
            }
        }
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
        .onAppear { populateItemsIfNeeded() }
    }

    private func itemRow(_ item: Binding<EditableItem>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                Toggle("", isOn: item.isIncluded)
                    .labelsHidden()
                VStack(alignment: .leading, spacing: 2) {
                    TextField(L10n.name, text: item.name)
                        .font(.body)
                    Text(item.wrappedValue.quantityDescription)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let matchedFood = item.wrappedValue.matchedFood {
                Label(L10n.aiMealMatched(matchedFood.name), systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }

            if item.wrappedValue.confidence < 0.5 {
                Label(L10n.aiMealLowConfidence, systemImage: "exclamationmark.triangle")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }

            macroField(L10n.calories, text: item.calories, unit: "kcal", color: MacroColors.calories)
            macroField(L10n.protein, text: item.protein, unit: "g", color: MacroColors.protein)
            macroField(L10n.carbs, text: item.carbs, unit: "g", color: MacroColors.carbs)
            macroField(L10n.fat, text: item.fat, unit: "g", color: MacroColors.fat)
            macroField(L10n.fiber, text: item.fiber, unit: "g", color: MacroColors.fiber)
        }
        .opacity(item.wrappedValue.isIncluded ? 1 : 0.5)
    }

    private func macroField(_ label: String, text: Binding<String>, unit: String, color: Color) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(color)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text(unit)
                .foregroundStyle(.secondary)
                .frame(width: 30, alignment: .leading)
        }
    }

    private func populateItemsIfNeeded() {
        guard items.isEmpty else { return }
        items = estimate.items.map { item in
            EditableItem(
                isIncluded: true,
                name: item.name,
                matchedFood: item.matchedFoodId.flatMap { foodRepository.food(id: $0) },
                quantityDescription: item.quantityDescription,
                grams: item.grams,
                servings: item.servings,
                calories: Self.formatted(item.calories),
                protein: Self.formatted(item.protein),
                carbs: Self.formatted(item.carbs),
                fat: Self.formatted(item.fat),
                fiber: Self.formatted(item.fiber),
                confidence: item.confidence
            )
        }
    }

    private static func formatted(_ value: Double?) -> String {
        guard let value else { return "" }
        return MacroFormat.kcal(value)
    }

    private func logAll() async {
        isLogging = true
        errorMessage = nil
        var loggedCount = 0
        for item in items where item.isIncluded {
            do {
                try await logItem(item)
                loggedCount += 1
            } catch {
                // Keep logging the remaining items; surface a single error if
                // nothing at all made it through.
            }
        }
        isLogging = false
        if loggedCount > 0 {
            onLogged(loggedCount)
        } else {
            errorMessage = L10n.failedToLog
        }
    }

    private func logItem(_ item: EditableItem) async throws {
        if let food = item.matchedFood, let servings = resolvedServings(for: item, food: food) {
            let entry = EntryCreate(foodId: food.id, mealType: mealType, servings: servings, date: date)
            try await entryRepository.createEntry(entry, food: food)
            return
        }

        let entry = EntryCreate(
            mealType: mealType,
            servings: 1,
            date: date,
            quickName: item.name,
            quickCalories: Double.parseUserInput(item.calories),
            quickProtein: Double.parseUserInput(item.protein),
            quickCarbs: Double.parseUserInput(item.carbs),
            quickFat: Double.parseUserInput(item.fat),
            quickFiber: Double.parseUserInput(item.fiber)
        )
        try await entryRepository.createEntry(entry)
    }

    /// Prefers the LLM's own serving count; otherwise converts an estimated
    /// gram amount using the matched food's serving size, but only when that
    /// food's serving unit is grams (a serving in ml/cup/etc can't be derived
    /// from a gram estimate). Returns `nil` when neither is usable, so the
    /// caller falls back to a quick entry with the AI's macro estimate.
    private func resolvedServings(for item: EditableItem, food: Food) -> Double? {
        if let servings = item.servings {
            return servings
        }
        if let grams = item.grams, food.servingUnit == .g, food.servingSize > 0 {
            return grams / food.servingSize
        }
        return nil
    }
}
