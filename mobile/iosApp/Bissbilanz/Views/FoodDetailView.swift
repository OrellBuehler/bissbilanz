import SwiftUI

struct FoodDetailView: View {
    @EnvironmentObject var api: BissbilanzAPI

    let foodId: String

    @State private var food: Food?
    @State private var isLoading = true
    @State private var error: Error?

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadFood() } }
            } else if let food {
                foodContent(food)
            }
        }
        .navigationTitle(food?.name ?? "Food")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadFood() }
    }

    private func foodContent(_ food: Food) -> some View {
        List {
            Section {
                if let brand = food.brand {
                    HStack {
                        Text("Brand")
                        Spacer()
                        Text(brand)
                            .foregroundStyle(.secondary)
                    }
                }
                HStack {
                    Text("Serving Size")
                    Spacer()
                    Text("\(Int(food.servingSize)) \(food.servingUnit.displayName)")
                        .foregroundStyle(.secondary)
                }
                if let barcode = food.barcode {
                    HStack {
                        Text("Barcode")
                        Spacer()
                        Text(barcode)
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                }
            }

            Section("Main Macros") {
                NutrientRow(label: "Calories", value: food.calories, unit: "kcal", color: MacroColors.calories)
                NutrientRow(label: "Protein", value: food.protein, unit: "g", color: MacroColors.protein)
                NutrientRow(label: "Carbs", value: food.carbs, unit: "g", color: MacroColors.carbs)
                NutrientRow(label: "Fat", value: food.fat, unit: "g", color: MacroColors.fat)
                NutrientRow(label: "Fiber", value: food.fiber, unit: "g", color: MacroColors.fiber)
            }

            NutrientSection(title: "Fat Breakdown", nutrients: food.fatBreakdownNutrients)
            NutrientSection(title: "Sugars & Carbs", nutrients: food.sugarCarbNutrients)
            NutrientSection(title: "Minerals", nutrients: food.mineralNutrients)
            NutrientSection(title: "Vitamins", nutrients: food.vitaminNutrients)
            NutrientSection(title: "Other", nutrients: food.otherNutrients)

            if let nutriScore = food.nutriScore {
                Section("Quality") {
                    HStack {
                        Text("Nutri-Score")
                        Spacer()
                        Text(nutriScore.uppercased())
                            .fontWeight(.bold)
                            .foregroundStyle(nutriScoreColor(nutriScore))
                    }
                    if let novaGroup = food.novaGroup {
                        HStack {
                            Text("NOVA Group")
                            Spacer()
                            Text("\(novaGroup)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            if let ingredients = food.ingredientsText, !ingredients.isEmpty {
                Section("Ingredients") {
                    Text(ingredients)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func nutriScoreColor(_ score: String) -> Color {
        switch score.lowercased() {
        case "a": return .green
        case "b": return Color(red: 0.5, green: 0.8, blue: 0.2)
        case "c": return .yellow
        case "d": return .orange
        case "e": return .red
        default: return .secondary
        }
    }

    private func loadFood() async {
        isLoading = true
        error = nil
        do {
            food = try await api.getFood(id: foodId)
        } catch {
            self.error = error
        }
        isLoading = false
    }
}
