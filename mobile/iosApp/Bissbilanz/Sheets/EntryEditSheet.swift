import SwiftUI

struct EntryEditSheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Environment(\.dismiss) private var dismiss

    let entry: Entry
    let onSaved: (Entry) -> Void

    @State private var servings: Double
    @State private var mealType: String
    @State private var eatenTime: Date
    @State private var notes: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    /// Per-serving quick macros, editable only for entries with no food or
    /// recipe behind them — a food-backed entry's nutrition belongs to the food.
    @State private var calories: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    @State private var fiber: String
    /// Extended quick nutrients keyed by the server's nutrient key, as typed.
    @State private var additionalValues: [String: String]
    /// Nutrient keys the user has enabled in Settings; nil offers every one.
    @State private var visibleNutrientKeys: Set<String>?

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    init(entry: Entry, onSaved: @escaping (Entry) -> Void) {
        self.entry = entry
        self.onSaved = onSaved
        _servings = State(initialValue: entry.servings)
        _mealType = State(initialValue: entry.mealType)
        _eatenTime = State(initialValue: entry.loggedAt ?? Date())
        _notes = State(initialValue: entry.notes ?? "")
        _calories = State(initialValue: Self.field(entry.quickCalories))
        _protein = State(initialValue: Self.field(entry.quickProtein))
        _carbs = State(initialValue: Self.field(entry.quickCarbs))
        _fat = State(initialValue: Self.field(entry.quickFat))
        _fiber = State(initialValue: Self.field(entry.quickFiber))
        _additionalValues = State(
            initialValue: (entry.quickNutrients ?? [:]).mapValues { MacroFormat.nutrient($0) }
        )
    }

    private static func field(_ value: Double?) -> String {
        value.map { MacroFormat.nutrient($0) } ?? ""
    }

    /// A quick entry — no food and no recipe resolves its macros, so the values
    /// stored on the entry itself are the only ones there are, and editable.
    private var isQuickEntry: Bool {
        entry.foodId == nil && entry.recipeId == nil
    }

    /// A quick entry has to keep its calories. The server's `entryCreateSchema`
    /// requires `foodId`, `recipeId` or a positive `quickCalories`, and for an
    /// entry that hasn't uploaded yet the edit is merged into the still-queued
    /// create (`EntryRepository.coalesceQueuedCreate`) — an emptied field would
    /// drop `quickCalories` from that create, the POST would 400, and the sync
    /// queue drops client errors for good, stranding the entry as a local
    /// `temp_` row forever.
    private var canSave: Bool {
        guard isQuickEntry else { return true }
        return (Double.parseUserInput(calories) ?? 0) > 0
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

                if isQuickEntry {
                    quickNutritionSections
                } else if let macros = perServingMacros {
                    Section(L10n.nutrition) {
                        NutrientRow(label: L10n.calories, value: macros.calories * servings, unit: "kcal")
                        NutrientRow(label: L10n.protein, value: macros.protein * servings, unit: "g")
                        NutrientRow(label: L10n.carbs, value: macros.carbs * servings, unit: "g")
                        NutrientRow(label: L10n.fat, value: macros.fat * servings, unit: "g")
                        NutrientRow(label: L10n.fiber, value: macros.fiber * servings, unit: "g")
                    }
                }

                Section(L10n.notes) {
                    TextField(L10n.notes, text: $notes, axis: .vertical)
                        .lineLimit(2 ... 4)
                }
            }
            .keyboardDismissable()
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
                    .disabled(isSaving || !canSave)
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
        .task { loadVisibleNutrients() }
    }

    @ViewBuilder
    private var quickNutritionSections: some View {
        Section {
            NutrientInputField(label: L10n.calories, text: $calories, unit: "kcal")
            NutrientInputField(label: L10n.protein, text: $protein, unit: "g")
            NutrientInputField(label: L10n.carbs, text: $carbs, unit: "g")
            NutrientInputField(label: L10n.fat, text: $fat, unit: "g")
            NutrientInputField(label: L10n.fiber, text: $fiber, unit: "g")
        } header: {
            Text(L10n.nutritionPerServing)
        } footer: {
            // Says why Save is disabled rather than leaving it inert.
            if !canSave {
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
        var update = EntryUpdate(mealType: mealType, servings: servings, eatenAt: eatenAtString())
        // Always sent, never omitted: an emptied note has to reach the server as
        // an explicit null or the old text survives the edit.
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let storedNotes: String? = trimmedNotes.isEmpty ? nil : trimmedNotes
        update.notes = .some(storedNotes)
        if isQuickEntry {
            update.quickCalories = .some(Double.parseUserInput(calories))
            update.quickProtein = .some(Double.parseUserInput(protein))
            update.quickCarbs = .some(Double.parseUserInput(carbs))
            update.quickFat = .some(Double.parseUserInput(fat))
            update.quickFiber = .some(Double.parseUserInput(fiber))
            let parsed = additionalValues.compactMapValues { Double.parseUserInput($0) }
            let storedNutrients: [String: Double]? = parsed.isEmpty ? nil : parsed
            update.quickNutrients = .some(storedNutrients)
        }
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
