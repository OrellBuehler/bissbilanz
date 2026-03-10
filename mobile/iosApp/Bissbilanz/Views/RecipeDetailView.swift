import SwiftUI

struct RecipeDetailView: View {
    @EnvironmentObject var api: BissbilanzAPI

    let recipeId: String

    @State private var recipe: Recipe?
    @State private var isLoading = true
    @State private var error: Error?

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadRecipe() } }
            } else if let recipe {
                recipeContent(recipe)
            }
        }
        .navigationTitle(recipe?.name ?? "Recipe")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadRecipe() }
    }

    private func recipeContent(_ recipe: Recipe) -> some View {
        List {
            Section {
                HStack {
                    Text("Total Servings")
                    Spacer()
                    Text("\(Int(recipe.totalServings))")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Per Serving") {
                if let cal = recipe.calories {
                    NutrientRow(label: "Calories", value: cal / recipe.totalServings, unit: "kcal", color: MacroColors.calories)
                }
                if let p = recipe.protein {
                    NutrientRow(label: "Protein", value: p / recipe.totalServings, unit: "g", color: MacroColors.protein)
                }
                if let c = recipe.carbs {
                    NutrientRow(label: "Carbs", value: c / recipe.totalServings, unit: "g", color: MacroColors.carbs)
                }
                if let f = recipe.fat {
                    NutrientRow(label: "Fat", value: f / recipe.totalServings, unit: "g", color: MacroColors.fat)
                }
                if let fb = recipe.fiber {
                    NutrientRow(label: "Fiber", value: fb / recipe.totalServings, unit: "g", color: MacroColors.fiber)
                }
            }

            if let ingredients = recipe.ingredients, !ingredients.isEmpty {
                Section("Ingredients") {
                    ForEach(ingredients) { ingredient in
                        HStack {
                            Text(ingredient.food?.name ?? "Food \(ingredient.foodId)")
                                .lineLimit(1)
                            Spacer()
                            Text("\(ingredient.quantity, specifier: "%.1f") \(ingredient.servingUnit.displayName)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Totals") {
                if let cal = recipe.calories {
                    NutrientRow(label: "Calories", value: cal, unit: "kcal", color: MacroColors.calories)
                }
                if let p = recipe.protein {
                    NutrientRow(label: "Protein", value: p, unit: "g", color: MacroColors.protein)
                }
                if let c = recipe.carbs {
                    NutrientRow(label: "Carbs", value: c, unit: "g", color: MacroColors.carbs)
                }
                if let f = recipe.fat {
                    NutrientRow(label: "Fat", value: f, unit: "g", color: MacroColors.fat)
                }
                if let fb = recipe.fiber {
                    NutrientRow(label: "Fiber", value: fb, unit: "g", color: MacroColors.fiber)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func loadRecipe() async {
        isLoading = true
        error = nil
        do {
            recipe = try await api.getRecipe(id: recipeId)
        } catch {
            self.error = error
        }
        isLoading = false
    }
}
