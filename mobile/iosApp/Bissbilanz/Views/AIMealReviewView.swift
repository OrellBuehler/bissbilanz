import SwiftUI

/// Where a review was opened from a queued `AiTask` rather than the live
/// `AIMealSheet` flow — an `AiTaskProcessor` review-first result the user is
/// confirming from `AiTasksView`'s "Ready to review" row. Carries what
/// `logAll()` needs to complete the task on confirm: `pendingFoods` resolves
/// an item's synthetic `matchedFoodId` (see `AiTaskProcessor.pendingFoodKey`)
/// to the `FoodCreate` to build on confirm, and `source` becomes the
/// completion's `processedBy`.
struct AiTaskReviewContext {
    let taskId: String
    let pendingFoods: [String: FoodCreate]
    let source: MealEstimateSource
    /// The task's server `updatedAt` as last known (see `AiTasksView`, which
    /// only offers a draft for review while its task is still confirmed
    /// pending) — carried as the completion's last-write-wins guard, so a
    /// task edited elsewhere while the user was reviewing this draft loses
    /// the race instead of being silently completed over. See
    /// `SyncManager.execute` for what happens when that guard fires.
    let clientEditedAt: String?
}

/// Editable review of an estimate before logging — either a live
/// `AIMealSheet` estimate (pushed within that sheet's stack, Back returns to
/// the form) or an `AiTaskProcessor` review-first result opened from
/// `AiTasksView` (`taskContext` set). Matched items log against the matched
/// food (by servings, falling back to a grams/serving size conversion); a
/// `taskContext` item pending its own not-yet-created food is created on
/// confirm; everything else logs as a quick entry with the AI's macro
/// estimate. `onLogged` reports how many items were logged so the presenting
/// screen can show its own toast and tear this view down.
struct AIMealReviewView: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(SyncManager.self) private var syncManager

    let estimate: MealEstimate
    let date: String
    let mealType: String
    var eatenAt: String?
    var taskContext: AiTaskReviewContext?
    var onLogged: (Int) -> Void = { _ in }

    @State private var items: [EditableItem] = []
    @State private var isLogging = false
    @State private var errorMessage: String?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    private struct EditableItem: Identifiable {
        let id = UUID()
        var isIncluded: Bool
        var name: String
        var matchedFood: Food?
        /// Set instead of `matchedFood` for a `taskContext` item
        /// `AiTaskProcessor` identified (a label or link match) but has not
        /// created yet — created on confirm, in `logItem`.
        var pendingFoodCreate: FoodCreate?
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
                        if estimate.source == .privateCloudCompute {
                            Label(L10n.aiMealPrivateCloudDisclaimer, systemImage: "cloud")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
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
                    .accessibilityLabel(L10n.aiMealIncludeItem(item.wrappedValue.name))
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
            } else if item.wrappedValue.pendingFoodCreate != nil {
                Label(L10n.aiTaskProcessorNewFoodBadge, systemImage: "plus.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.blue)
            }

            if item.wrappedValue.confidence < 0.5 {
                Label(L10n.aiMealLowConfidence, systemImage: "exclamationmark.triangle")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }

            macroField(L10n.calories, text: item.calories, unit: "kcal", color: accessibleColor(.calories))
            macroField(L10n.protein, text: item.protein, unit: "g", color: accessibleColor(.protein))
            macroField(L10n.carbs, text: item.carbs, unit: "g", color: accessibleColor(.carbs))
            macroField(L10n.fat, text: item.fat, unit: "g", color: accessibleColor(.fat))
            macroField(L10n.fiber, text: item.fiber, unit: "g", color: accessibleColor(.fiber))
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
                .accessibilityLabel("\(label) (\(unit))")
            Text(unit)
                .foregroundStyle(.secondary)
                .frame(width: 30, alignment: .leading)
                .accessibilityHidden(true)
        }
    }

    private func populateItemsIfNeeded() {
        guard items.isEmpty else { return }
        items = estimate.items.map { item in
            let pendingFoodCreate = item.matchedFoodId.flatMap { taskContext?.pendingFoods[$0] }
            return EditableItem(
                isIncluded: true,
                name: item.name,
                matchedFood: pendingFoodCreate == nil ? item.matchedFoodId.flatMap { foodRepository.food(id: $0) } : nil,
                pendingFoodCreate: pendingFoodCreate,
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
        var localEntryIds: [String] = []
        var loggedItems: [EditableItem] = []
        for item in items where item.isIncluded {
            do {
                localEntryIds.append(try await logItem(item))
                loggedItems.append(item)
                loggedCount += 1
            } catch {
                // Keep logging the remaining items; surface a single error if
                // nothing at all made it through.
                ErrorReporter.captureWarning("AI meal review item log failed", context: ["reason": ErrorReporter.reason(for: error)])
            }
        }
        isLogging = false
        if loggedCount > 0 {
            if let taskContext {
                syncManager.enqueue(.completeAiTask(
                    taskId: taskContext.taskId,
                    localEntryIds: localEntryIds,
                    resultSummary: Self.summaryText(for: loggedItems),
                    processedBy: AiTaskProcessor.processedBy(for: taskContext.source),
                    clientEditedAt: taskContext.clientEditedAt
                ))
            }
            onLogged(loggedCount)
        } else {
            errorMessage = L10n.failedToLog
        }
    }

    /// Returns the local id of the entry it created, so `logAll` can complete
    /// the `taskContext` task once every included item has logged.
    @discardableResult
    private func logItem(_ item: EditableItem) async throws -> String {
        if let pendingFoodCreate = item.pendingFoodCreate {
            let food = try await foodRepository.createFood(pendingFoodCreate)
            let entry = EntryCreate(
                foodId: food.id, mealType: mealType, servings: item.servings ?? 1, date: date, eatenAt: eatenAt
            )
            return try await entryRepository.createEntry(entry, food: food).id
        }

        if let food = item.matchedFood, let servings = resolvedServings(for: item, food: food) {
            let entry = EntryCreate(foodId: food.id, mealType: mealType, servings: servings, date: date, eatenAt: eatenAt)
            return try await entryRepository.createEntry(entry, food: food).id
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
            quickFiber: Double.parseUserInput(item.fiber),
            eatenAt: eatenAt
        )
        return try await entryRepository.createEntry(entry).id
    }

    /// e.g. "Logged egg, toast (≈420 kcal)" — mirrors
    /// `AiTaskProcessor.summarize(items:)`, but over the post-edit
    /// `EditableItem` values the user actually confirmed rather than the raw
    /// estimate.
    private static func summaryText(for items: [EditableItem]) -> String {
        let joined = items.map(\.name).joined(separator: ", ")
        let totalCalories = items.reduce(0.0) { $0 + (Double.parseUserInput($1.calories) ?? 0) }
        return L10n.aiTaskProcessorResultSummary(joined, Int(totalCalories.rounded()))
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
