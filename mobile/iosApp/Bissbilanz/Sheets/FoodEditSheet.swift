import SwiftUI

/// Presentation wrapper for `FoodEditForm`: supplies the `NavigationStack` and
/// Cancel button a flat sheet needs. Flows that push the form into their own
/// stack (the barcode scanner) use `FoodEditForm` directly.
struct FoodEditSheet: View {
    @Environment(\.dismiss) private var dismiss

    let existingFood: Food?
    let initialBarcode: String?
    let onSaved: (Food) -> Void

    init(food: Food? = nil, barcode: String? = nil, onSaved: @escaping (Food) -> Void = { _ in }) {
        existingFood = food
        initialBarcode = barcode
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            FoodEditForm(food: existingFood, barcode: initialBarcode) { saved in
                onSaved(saved)
                dismiss()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
        }
    }
}

/// Bare food create/edit form: no `NavigationStack`, no Cancel item, and it
/// never dismisses itself — `@Environment(\.dismiss)` pops when pushed and
/// dismisses when presented, so the enclosing container decides what happens
/// after `onSaved` and one body stays correct in both modes.
struct FoodEditForm: View {
    @Environment(FoodRepository.self) private var foodRepository

    let existingFood: Food?
    let onSaved: (Food) -> Void

    @State private var name = ""
    @State private var brand = ""
    @State private var barcode = ""
    @State private var servingSize = "100"
    @State private var servingUnit: ServingUnit = .g
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var fiber = ""
    /// Whether the entered macro/nutrient values are per 100 g/ml (true) or for
    /// one serving (false). Per-100 g entries are scaled to the per-serving
    /// basis the food record stores when saving, so the user never has to do
    /// the math themselves.
    @State private var perHundredBasis = false
    @State private var isFavorite = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    /// Additional nutrients keyed by their FoodCreate field name. The user can
    /// add any supported nutrient here; the label scanner also fills a few.
    @State private var additionalValues: [String: String] = [:]

    let initialBarcode: String?

    init(food: Food? = nil, barcode: String? = nil, onSaved: @escaping (Food) -> Void = { _ in }) {
        existingFood = food
        initialBarcode = barcode
        self.onSaved = onSaved
    }

    var body: some View {
        Form {
            if existingFood == nil {
                Section {
                    // Pushed, not presented: the scan is a step inside this
                    // form's flow, and it works in whichever stack encloses
                    // the form (the sheet wrapper's or the barcode scanner's).
                    NavigationLink {
                        NutritionLabelScanView { parsed in
                            apply(parsed)
                        }
                    } label: {
                        Label(L10n.scanLabel, systemImage: "doc.text.viewfinder")
                    }
                } footer: {
                    Text(L10n.scanLabelFooter)
                }
            }

            Section {
                TextField(L10n.name, text: $name)
                TextField(L10n.brand, text: $brand)
                TextField(L10n.barcode, text: $barcode)
                    .keyboardType(.numberPad)
            }

            Section(L10n.servingSize) {
                // Split the row 60/40 so the amount gets most of the width
                // and the unit picker no longer crowds it out.
                GeometryReader { geo in
                    HStack(spacing: 8) {
                        TextField("100", text: $servingSize)
                            .keyboardType(.decimalPad)
                            .frame(width: max(geo.size.width * 0.6 - 4, 0), alignment: .leading)
                        Picker(L10n.unit, selection: $servingUnit) {
                            ForEach(ServingUnit.allCases, id: \.self) { unit in
                                Text(unit.displayName).tag(unit)
                            }
                        }
                        .labelsHidden()
                        .frame(width: max(geo.size.width * 0.4 - 4, 0), alignment: .trailing)
                    }
                }
                .frame(height: 34)
            }

            Section {
                Picker(L10n.valuesPer, selection: $perHundredBasis) {
                    Text(L10n.perServing).tag(false)
                    Text(servingUnit.isVolume ? L10n.per100Ml : L10n.per100).tag(true)
                }
                .pickerStyle(.segmented)
                macroField(L10n.calories, text: $calories, unit: "kcal")
                macroField(L10n.protein, text: $protein, unit: "g")
                macroField(L10n.carbs, text: $carbs, unit: "g")
                macroField(L10n.fat, text: $fat, unit: "g")
                macroField(L10n.fiber, text: $fiber, unit: "g")
            } header: {
                Text(L10n.mainMacros)
            } footer: {
                Text(L10n.macroBasisFooter)
            }

            Section(L10n.additionalNutrients) {
                ForEach(addedNutrients) { spec in
                    additionalNutrientField(spec)
                }
                .onDelete(perform: removeAdditionalNutrients)

                Menu {
                    ForEach(NutrientCatalog.categories) { category in
                        if category.nutrients.contains(where: { additionalValues[$0.key] == nil }) {
                            Menu(category.title) {
                                ForEach(category.nutrients) { spec in
                                    if additionalValues[spec.key] == nil {
                                        Button(spec.label) { additionalValues[spec.key] = "" }
                                    }
                                }
                            }
                        }
                    }
                } label: {
                    Label(L10n.addNutrient, systemImage: "plus.circle")
                }
            }

            Section {
                Toggle(L10n.favorite, isOn: $isFavorite)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .keyboardDismissable()
        .navigationTitle(existingFood != nil ? L10n.editFood : L10n.createFood)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.save) {
                    Task { await save() }
                }
                .disabled(name.isEmpty || isSaving)
                .fontWeight(.semibold)
            }
        }
        .onAppear { prefill() }
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
                .frame(width: 35, alignment: .leading)
        }
    }

    /// Catalog rows the user has added a value row for, in catalog order.
    private var addedNutrients: [AdditionalNutrientSpec] {
        NutrientCatalog.all.filter { additionalValues[$0.key] != nil }
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

    private func prefill() {
        if let bc = initialBarcode, existingFood == nil {
            barcode = bc
        }
        guard let food = existingFood else { return }
        name = food.name
        brand = food.brand ?? ""
        barcode = food.barcode ?? ""
        servingSize = "\(food.servingSize)"
        servingUnit = food.servingUnit
        calories = "\(food.calories)"
        protein = "\(food.protein)"
        carbs = "\(food.carbs)"
        fat = "\(food.fat)"
        fiber = "\(food.fiber)"
        isFavorite = food.isFavorite

        // Surface any extended nutrients already stored on the food so they can
        // be reviewed and edited alongside newly added ones.
        let encoded = (try? JSONPatch.dictionary(of: food)) ?? [:]
        for spec in NutrientCatalog.all {
            if let number = encoded[spec.key] as? NSNumber {
                additionalValues[spec.key] = Self.numberString(number.doubleValue)
            }
        }
    }

    /// Prefills the editable fields from an OCR'd nutrition label. Values are
    /// per 100 g (the parser's canonical basis); the user adjusts the serving
    /// and confirms before saving.
    private func apply(_ parsed: ParsedNutrition) {
        servingSize = "100"
        servingUnit = .g
        // The parser reports per-100 g values, so switch the basis to match;
        // the user can change the serving and the totals are scaled on save.
        perHundredBasis = true
        if let value = parsed.calories { calories = Self.numberString(value) }
        if let value = parsed.protein { protein = Self.numberString(value) }
        if let value = parsed.carbs { carbs = Self.numberString(value) }
        if let value = parsed.fat { fat = Self.numberString(value) }
        if let value = parsed.fiber { fiber = Self.numberString(value) }
        if let value = parsed.sugar { additionalValues["sugar"] = Self.numberString(value) }
        if let value = parsed.saturatedFat { additionalValues["saturatedFat"] = Self.numberString(value) }
        if let value = parsed.salt { additionalValues["salt"] = Self.numberString(value) }
        if let value = parsed.sodium { additionalValues["sodium"] = Self.numberString(value) }
    }

    /// Renders a parsed value without a trailing ".0".
    private static func numberString(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let serving = Double.parseUserInput(servingSize) ?? 100
        // The food record stores per-serving values. When the user entered the
        // per-100 g/ml basis, normalize the serving to grams/milliliters first
        // (e.g. 33 cl = 330 ml) and scale by servingInBase/100; per-serving
        // entries are stored as-is (factor 1).
        let servingInBase = serving * servingUnit.baseUnitsPerUnit
        let factor = perHundredBasis && servingInBase > 0 ? servingInBase / 100 : 1

        var foodData = FoodCreate(
            name: name,
            brand: brand.isEmpty ? nil : brand,
            servingSize: serving,
            servingUnit: servingUnit,
            calories: (Double.parseUserInput(calories) ?? 0) * factor,
            protein: (Double.parseUserInput(protein) ?? 0) * factor,
            carbs: (Double.parseUserInput(carbs) ?? 0) * factor,
            fat: (Double.parseUserInput(fat) ?? 0) * factor,
            fiber: (Double.parseUserInput(fiber) ?? 0) * factor,
            barcode: barcode.isEmpty ? nil : barcode,
            isFavorite: isFavorite
        )

        // Overlay the additional nutrient values onto the matching FoodCreate
        // fields by their JSON key, scaled by the same basis factor. Blank or
        // unparseable rows are skipped.
        var patch: [String: Any] = [:]
        for (key, text) in additionalValues {
            if let value = Double.parseUserInput(text) {
                patch[key] = value * factor
            }
        }
        if !patch.isEmpty {
            foodData = (try? JSONPatch.merged(FoodCreate.self, base: foodData, patch: patch)) ?? foodData
        }

        do {
            let saved: Food = if let existing = existingFood {
                try await foodRepository.updateFood(id: existing.id, foodData)
            } else {
                try await foodRepository.createFood(foodData)
            }
            onSaved(saved)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
