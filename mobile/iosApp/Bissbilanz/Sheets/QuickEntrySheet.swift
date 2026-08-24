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

                Section(L10n.nutrition) {
                    macroField(L10n.calories, text: $calories, unit: "kcal")
                    macroField(L10n.protein, text: $protein, unit: "g")
                    macroField(L10n.carbs, text: $carbs, unit: "g")
                    macroField(L10n.fat, text: $fat, unit: "g")
                    macroField(L10n.fiber, text: $fiber, unit: "g")
                }

                Section(L10n.additionalNutrients) {
                    ForEach(addedNutrients) { spec in
                        additionalNutrientField(spec)
                    }
                    .onDelete(perform: removeAdditionalNutrients)

                    Menu {
                        ForEach(availableCategories) { category in
                            Menu(category.title) {
                                ForEach(category.nutrients) { spec in
                                    Button(spec.label) { additionalValues[spec.key] = "" }
                                }
                            }
                        }
                    } label: {
                        Label(L10n.addNutrient, systemImage: "plus.circle")
                    }
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
                    .disabled(name.isEmpty || isSaving)
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

    private func macroField(_ label: String, text: Binding<String>, unit: String) -> some View {
        HStack {
            Text(label)
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

    /// Nutrient rows the user has added a value for, in catalog order.
    private var addedNutrients: [AdditionalNutrientSpec] {
        NutrientCatalog.all.filter { additionalValues[$0.key] != nil }
    }

    /// "Add Nutrient" menu categories, restricted to the user's enabled
    /// nutrients (or every nutrient when none are configured) and excluding
    /// rows already added.
    private var availableCategories: [AdditionalNutrientCategory] {
        NutrientCatalog.categories.compactMap { category in
            let nutrients = category.nutrients.filter { spec in
                additionalValues[spec.key] == nil && isVisible(spec.key)
            }
            guard !nutrients.isEmpty else { return nil }
            return AdditionalNutrientCategory(title: category.title, nutrients: nutrients)
        }
    }

    private func isVisible(_ key: String) -> Bool {
        guard let visibleNutrientKeys, !visibleNutrientKeys.isEmpty else { return true }
        return visibleNutrientKeys.contains(key)
    }

    private func additionalNutrientField(_ spec: AdditionalNutrientSpec) -> some View {
        macroField(spec.label, text: Binding(
            get: { additionalValues[spec.key] ?? "" },
            set: { additionalValues[spec.key] = $0 }
        ), unit: spec.unit)
    }

    private func removeAdditionalNutrients(at offsets: IndexSet) {
        let specs = addedNutrients
        for index in offsets {
            additionalValues[specs[index].key] = nil
        }
    }

    private func loadVisibleNutrients() {
        let nutrients = preferencesRepository.preferences()?.visibleNutrients ?? []
        visibleNutrientKeys = nutrients.isEmpty ? nil : Set(nutrients)
    }

    private func save() async {
        isSaving = true
        let parsedNutrients = additionalValues.compactMapValues { Double.parseUserInput($0) }
        let entry = EntryCreate(
            mealType: mealType,
            servings: 1,
            date: date,
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
