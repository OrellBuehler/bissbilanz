import SwiftUI

struct EntryEditSheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    let entry: Entry
    let onSaved: (Entry) -> Void

    @State private var servings: Double
    @State private var mealType: String
    @State private var eatenTime: Date
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    init(entry: Entry, onSaved: @escaping (Entry) -> Void) {
        self.entry = entry
        self.onSaved = onSaved
        _servings = State(initialValue: entry.servings)
        _mealType = State(initialValue: entry.mealType)
        _eatenTime = State(initialValue: entry.loggedAt ?? Date())
    }

    /// "0.75 × 50 g = 37.5 g" — the food's serving size with the amount the
    /// picked serving count works out to, so the user can judge the quantity
    /// without remembering the food. `nil` for quick entries and recipes,
    /// which carry no serving size.
    private var servingSizeText: String? {
        guard let size = entry.servingSize, let unit = entry.servingUnit else { return nil }
        let count = MacroFormat.servings(servings)
        let perServing = "\(MacroFormat.nutrient(size)) \(unit.displayName)"
        let total = "\(MacroFormat.nutrient(size * servings)) \(unit.displayName)"
        return "\(count) × \(perServing) = \(total)"
    }

    /// Per-serving macros resolved server-side (food/recipe) or stored on the
    /// entry (quick add). `nil` when the entry predates a refresh and carries
    /// no macros — the nutrition section is skipped rather than showing zeros.
    private var perServingMacros: (calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double)? {
        guard let calories = entry.calories ?? entry.quickCalories else { return nil }
        return (
            calories: calories,
            protein: entry.protein ?? entry.quickProtein ?? 0,
            carbs: entry.carbs ?? entry.quickCarbs ?? 0,
            fat: entry.fat ?? entry.quickFat ?? 0,
            fiber: entry.fiber ?? entry.quickFiber ?? 0
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(entry.displayName)
                        .font(.headline)
                }

                Section {
                    ServingsField(servings: $servings)
                    if let servingSizeText {
                        HStack {
                            Text(L10n.servingSize)
                            Spacer()
                            Text(servingSizeText)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.menu)
                    DatePicker(L10n.time, selection: $eatenTime, displayedComponents: .hourAndMinute)
                }

                if let macros = perServingMacros {
                    Section(L10n.nutrition) {
                        NutrientRow(label: L10n.calories, value: macros.calories * servings, unit: "kcal")
                        NutrientRow(label: L10n.protein, value: macros.protein * servings, unit: "g")
                        NutrientRow(label: L10n.carbs, value: macros.carbs * servings, unit: "g")
                        NutrientRow(label: L10n.fat, value: macros.fat * servings, unit: "g")
                        NutrientRow(label: L10n.fiber, value: macros.fiber * servings, unit: "g")
                    }
                }
            }
            .navigationTitle(L10n.editEntry)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(isSaving)
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
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        isSaving = true
        let update = EntryUpdate(mealType: mealType, servings: servings, eatenAt: eatenAtString())
        do {
            let updated = try await entryRepository.updateEntry(id: entry.id, update)
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    /// The picked time-of-day on the entry's day, as the UTC ISO-8601 `eatenAt`
    /// wire value — mirrors `LogFoodSheet.eatenAtString()`. `nil` (eaten time
    /// left unchanged) only if the components can't be combined.
    private func eatenAtString() -> String? {
        let day = entry.date.flatMap { DateFormatting.date(from: $0) } ?? entry.loggedAt ?? Date()
        let time = Calendar.current.dateComponents([.hour, .minute], from: eatenTime)
        guard let combined = Calendar.current.date(
            bySettingHour: time.hour ?? 0,
            minute: time.minute ?? 0,
            second: 0,
            of: day
        ) else { return nil }
        return DateFormatting.isoDateTimeString(from: combined)
    }
}
