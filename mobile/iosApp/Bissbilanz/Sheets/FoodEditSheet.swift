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
    @State private var isFavorite = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    // Populated by the nutrition-label scanner and only shown once a scan has
    // happened, so the manual create flow stays unchanged.
    @State private var sugar = ""
    @State private var saturatedFat = ""
    @State private var salt = ""
    @State private var sodium = ""
    @State private var didScanLabel = false
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
                    TextField("Name", text: $name)
                    TextField(L10n.brand, text: $brand)
                    TextField(L10n.barcode, text: $barcode)
                        .keyboardType(.numberPad)
                }

                Section(L10n.servingSize) {
                    HStack {
                        TextField("100", text: $servingSize)
                            .keyboardType(.decimalPad)
                            .frame(width: 80)
                        Picker("Unit", selection: $servingUnit) {
                            ForEach(ServingUnit.allCases, id: \.self) { unit in
                                Text(unit.displayName).tag(unit)
                            }
                        }
                    }
                }

                Section(L10n.mainMacros) {
                    macroField(L10n.calories, text: $calories, unit: "kcal")
                    macroField(L10n.protein, text: $protein, unit: "g")
                    macroField(L10n.carbs, text: $carbs, unit: "g")
                    macroField(L10n.fat, text: $fat, unit: "g")
                    macroField(L10n.fiber, text: $fiber, unit: "g")
                }

                if didScanLabel {
                    Section(L10n.additionalNutrients) {
                        macroField(L10n.sugar, text: $sugar, unit: "g")
                        macroField(L10n.saturatedFat, text: $saturatedFat, unit: "g")
                        macroField(L10n.salt, text: $salt, unit: "g")
                        macroField(L10n.sodium, text: $sodium, unit: "mg")
                    }
                }

                Section {
                    Toggle("Favorite", isOn: $isFavorite)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
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
    }

    /// Prefills the editable fields from an OCR'd nutrition label. Values are
    /// per 100 g (the parser's canonical basis); the user adjusts the serving
    /// and confirms before saving.
    private func apply(_ parsed: ParsedNutrition) {
        servingSize = "100"
        servingUnit = .g
        if let value = parsed.calories { calories = Self.numberString(value) }
        if let value = parsed.protein { protein = Self.numberString(value) }
        if let value = parsed.carbs { carbs = Self.numberString(value) }
        if let value = parsed.fat { fat = Self.numberString(value) }
        if let value = parsed.fiber { fiber = Self.numberString(value) }
        if let value = parsed.sugar { sugar = Self.numberString(value) }
        if let value = parsed.saturatedFat { saturatedFat = Self.numberString(value) }
        if let value = parsed.salt { salt = Self.numberString(value) }
        if let value = parsed.sodium { sodium = Self.numberString(value) }
        didScanLabel = true
    }

    private func parsedValue(_ text: String) -> Double? {
        text.isEmpty ? nil : Double(text)
    }

    /// Renders a parsed value without a trailing ".0".
    private static func numberString(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let foodData = FoodCreate(
            name: name,
            brand: brand.isEmpty ? nil : brand,
            servingSize: Double(servingSize) ?? 100,
            servingUnit: servingUnit,
            calories: Double(calories) ?? 0,
            protein: Double(protein) ?? 0,
            carbs: Double(carbs) ?? 0,
            fat: Double(fat) ?? 0,
            fiber: Double(fiber) ?? 0,
            saturatedFat: parsedValue(saturatedFat),
            sugar: parsedValue(sugar),
            sodium: parsedValue(sodium),
            salt: parsedValue(salt),
            barcode: barcode.isEmpty ? nil : barcode,
            isFavorite: isFavorite
        )

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
}
