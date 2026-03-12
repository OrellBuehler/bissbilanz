import SwiftUI

struct FoodEditSheet: View {
    @Environment(BissbilanzAPI.self) private var api
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

    init(food: Food? = nil, onSaved: @escaping (Food) -> Void = { _ in }) {
        self.existingFood = food
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
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
            barcode: barcode.isEmpty ? nil : barcode,
            isFavorite: isFavorite
        )

        do {
            let saved: Food
            if let existing = existingFood {
                saved = try await api.updateFood(id: existing.id, foodData)
            } else {
                saved = try await api.createFood(foodData)
            }
            onSaved(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
