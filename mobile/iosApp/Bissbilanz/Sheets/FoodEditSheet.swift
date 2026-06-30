import SwiftUI

struct FoodEditSheet: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(\.dismiss) private var dismiss

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

    // Additional nutrients keyed by their FoodCreate field name. The user can
    // add any supported nutrient here; the label scanner also fills a few.
    @State private var additionalValues: [String: String] = [:]
    @State private var showLabelScanner = false

    let initialBarcode: String?

    init(food: Food? = nil, barcode: String? = nil, onSaved: @escaping (Food) -> Void = { _ in }) {
        existingFood = food
        initialBarcode = barcode
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                if existingFood == nil {
                    Section {
                        Button {
                            showLabelScanner = true
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
                        Text(L10n.per100).tag(true)
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
                        ForEach(Self.nutrientCatalog) { category in
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
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(name.isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { prefill() }
            .sheet(isPresented: $showLabelScanner) {
                NutritionLabelScanView { parsed in
                    apply(parsed)
                }
            }
        }
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
        Self.nutrientCatalog.flatMap(\.nutrients).filter { additionalValues[$0.key] != nil }
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
        for spec in Self.nutrientCatalog.flatMap(\.nutrients) {
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
        // per-100 g basis, scale everything by serving/100; per-serving entries
        // are stored as-is (factor 1).
        let factor = perHundredBasis && serving > 0 ? serving / 100 : 1

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
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    // Supported extended nutrients, grouped for the "Add Nutrient" menu. Keys
    // match the FoodCreate JSON fields; units mirror the food detail view.
    private static let nutrientCatalog: [AdditionalNutrientCategory] = [
        AdditionalNutrientCategory(title: "Fat Breakdown", nutrients: [
            AdditionalNutrientSpec(key: "saturatedFat", label: "Saturated Fat", unit: "g"),
            AdditionalNutrientSpec(key: "monounsaturatedFat", label: "Monounsaturated Fat", unit: "g"),
            AdditionalNutrientSpec(key: "polyunsaturatedFat", label: "Polyunsaturated Fat", unit: "g"),
            AdditionalNutrientSpec(key: "transFat", label: "Trans Fat", unit: "g"),
            AdditionalNutrientSpec(key: "cholesterol", label: "Cholesterol", unit: "mg"),
            AdditionalNutrientSpec(key: "omega3", label: "Omega-3", unit: "g"),
            AdditionalNutrientSpec(key: "omega6", label: "Omega-6", unit: "g"),
        ]),
        AdditionalNutrientCategory(title: "Sugars & Carbs", nutrients: [
            AdditionalNutrientSpec(key: "sugar", label: "Sugar", unit: "g"),
            AdditionalNutrientSpec(key: "addedSugars", label: "Added Sugars", unit: "g"),
            AdditionalNutrientSpec(key: "sugarAlcohols", label: "Sugar Alcohols", unit: "g"),
            AdditionalNutrientSpec(key: "starch", label: "Starch", unit: "g"),
        ]),
        AdditionalNutrientCategory(title: "Minerals", nutrients: [
            AdditionalNutrientSpec(key: "sodium", label: "Sodium", unit: "mg"),
            AdditionalNutrientSpec(key: "potassium", label: "Potassium", unit: "mg"),
            AdditionalNutrientSpec(key: "calcium", label: "Calcium", unit: "mg"),
            AdditionalNutrientSpec(key: "iron", label: "Iron", unit: "mg"),
            AdditionalNutrientSpec(key: "magnesium", label: "Magnesium", unit: "mg"),
            AdditionalNutrientSpec(key: "phosphorus", label: "Phosphorus", unit: "mg"),
            AdditionalNutrientSpec(key: "zinc", label: "Zinc", unit: "mg"),
            AdditionalNutrientSpec(key: "copper", label: "Copper", unit: "mg"),
            AdditionalNutrientSpec(key: "manganese", label: "Manganese", unit: "mg"),
            AdditionalNutrientSpec(key: "selenium", label: "Selenium", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "iodine", label: "Iodine", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "fluoride", label: "Fluoride", unit: "mg"),
            AdditionalNutrientSpec(key: "chromium", label: "Chromium", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "molybdenum", label: "Molybdenum", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "chloride", label: "Chloride", unit: "mg"),
        ]),
        AdditionalNutrientCategory(title: "Vitamins", nutrients: [
            AdditionalNutrientSpec(key: "vitaminA", label: "Vitamin A", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminC", label: "Vitamin C", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminD", label: "Vitamin D", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminE", label: "Vitamin E", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminK", label: "Vitamin K", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminB1", label: "Vitamin B1", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB2", label: "Vitamin B2", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB3", label: "Vitamin B3", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB5", label: "Vitamin B5", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB6", label: "Vitamin B6", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB7", label: "Vitamin B7", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminB9", label: "Vitamin B9", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminB12", label: "Vitamin B12", unit: "\u{00B5}g"),
        ]),
        AdditionalNutrientCategory(title: "Other", nutrients: [
            AdditionalNutrientSpec(key: "caffeine", label: "Caffeine", unit: "mg"),
            AdditionalNutrientSpec(key: "alcohol", label: "Alcohol", unit: "g"),
            AdditionalNutrientSpec(key: "water", label: "Water", unit: "g"),
            AdditionalNutrientSpec(key: "salt", label: "Salt", unit: "g"),
        ]),
    ]
}

private struct AdditionalNutrientSpec: Identifiable {
    let key: String
    let label: String
    let unit: String
    var id: String { key }
}

private struct AdditionalNutrientCategory: Identifiable {
    let title: String
    let nutrients: [AdditionalNutrientSpec]
    var id: String { title }
}
