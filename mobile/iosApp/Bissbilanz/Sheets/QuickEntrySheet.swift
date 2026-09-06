import SwiftUI

struct QuickEntrySheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Environment(\.dismiss) private var dismiss

    let date: String
    let onSaved: () -> Void

    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var fiber = ""
    @State private var notes = ""
    @State private var mealType = "Snacks"
    @State private var isSaving = false
    @State private var errorMessage: String?

    /// Additional nutrients keyed by the server's quick-entry nutrient key
    /// (matches the FoodCreate JSON fields in `NutrientCatalog`).
    @State private var additionalValues: [String: String] = [:]
    /// Nutrient keys the user has enabled in Settings. `nil` (preferences not
    /// loaded yet or none configured) falls back to showing every nutrient.
    @State private var visibleNutrientKeys: Set<String>?

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    /// A quick entry carries no food or recipe, so the server's
    /// `entryCreateSchema` requires a positive `quickCalories`. A create it
    /// rejects with a 400 is dropped permanently by the sync queue, which would
    /// strand the entry as a local `temp_` row — so gate the button instead.
    private var canSave: Bool {
        !name.isEmpty && (Double.parseUserInput(calories) ?? 0) > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.name, text: $name)
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section {
                    NutrientInputField(label: L10n.calories, text: $calories, unit: "kcal")
                    NutrientInputField(label: L10n.protein, text: $protein, unit: "g")
                    NutrientInputField(label: L10n.carbs, text: $carbs, unit: "g")
                    NutrientInputField(label: L10n.fat, text: $fat, unit: "g")
                    NutrientInputField(label: L10n.fiber, text: $fiber, unit: "g")
                } header: {
                    Text(L10n.nutrition)
                } footer: {
                    // Says why Log is disabled rather than leaving it inert.
                    if (Double.parseUserInput(calories) ?? 0) <= 0 {
                        Text(L10n.caloriesRequired)
                    }
                }

                Section(L10n.additionalNutrients) {
                    ForEach(NutrientCatalog.added(from: additionalValues)) { spec in
                        NutrientInputField(
                            label: spec.label,
                            text: binding(for: spec.key),
                            unit: spec.unit
                        )
                    }
                    .onDelete(perform: removeAdditionalNutrients)

                    AddNutrientMenu(values: $additionalValues, visibleNutrientKeys: visibleNutrientKeys)
                }

                Section(L10n.notes) {
                    TextField(L10n.notes, text: $notes, axis: .vertical)
                        .lineLimit(2 ... 4)
                }
            }
            .keyboardDismissable()
            .navigationTitle(L10n.quickEntry)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.log) {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSaving)
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
        .task { loadVisibleNutrients() }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(
            get: { additionalValues[key] ?? "" },
            set: { additionalValues[key] = $0 }
        )
    }

    private func removeAdditionalNutrients(at offsets: IndexSet) {
        let specs = NutrientCatalog.added(from: additionalValues)
        for index in offsets {
            additionalValues[specs[index].key] = nil
        }
    }

    private func loadVisibleNutrients() {
        let nutrients = preferencesRepository.preferences()?.visibleNutrients ?? []
        visibleNutrientKeys = nutrients.isEmpty ? nil : Set(nutrients)
    }

    private func save() async {
        guard canSave else { return }
        isSaving = true
        let parsedNutrients = additionalValues.compactMapValues { Double.parseUserInput($0) }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = EntryCreate(
            mealType: mealType,
            servings: 1,
            date: date,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            quickName: name,
            quickCalories: Double.parseUserInput(calories),
            quickProtein: Double.parseUserInput(protein),
            quickCarbs: Double.parseUserInput(carbs),
            quickFat: Double.parseUserInput(fat),
            quickFiber: Double.parseUserInput(fiber),
            quickNutrients: parsedNutrients.isEmpty ? nil : parsedNutrients
        )
        do {
            try await entryRepository.createEntry(entry)
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
