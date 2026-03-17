import SwiftUI

struct RecipeDetailView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let recipeId: String

    @State private var recipe: Recipe?
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showEditSheet = false
    @State private var showDeleteConfirmation = false
    @State private var showLogSheet = false
    @State private var errorMessage: String?

    var body: some View {
        VStack {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadRecipe() } }
            } else if let recipe {
                ZStack(alignment: .bottomTrailing) {
                    recipeContent(recipe)

                    Button {
                        showLogSheet = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 52))
                            .foregroundStyle(.white, Color.accentColor)
                            .shadow(radius: 4, y: 2)
                    }
                    .padding(20)
                }
            }
        }
        .navigationTitle(recipe?.name ?? L10n.recipes)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if recipe != nil {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            showEditSheet = true
                        } label: {
                            Label(L10n.edit, systemImage: "pencil")
                        }

                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label(L10n.delete, systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .sheet(isPresented: $showEditSheet) {
            if let recipe {
                RecipeEditSheet(recipe: recipe) { updatedRecipe in
                    self.recipe = updatedRecipe
                }
            }
        }
        .sheet(isPresented: $showLogSheet) {
            if let recipe {
                LogRecipeSheet(recipe: recipe) {
                    showLogSheet = false
                }
            }
        }
        .confirmationDialog(L10n.delete, isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button(L10n.delete, role: .destructive) {
                Task { await deleteRecipe() }
            }
            Button(L10n.cancel, role: .cancel) {}
        }
        .task { await loadRecipe() }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func recipeContent(_ recipe: Recipe) -> some View {
        List {
            Section {
                HStack {
                    Text(L10n.totalServings)
                    Spacer()
                    Text("\(Int(recipe.totalServings))")
                        .foregroundStyle(.secondary)
                }
                if recipe.isFavorite {
                    HStack {
                        Text(L10n.favorites)
                        Spacer()
                        Image(systemName: "star.fill")
                            .foregroundStyle(.yellow)
                    }
                }
            }

            Section(L10n.perServing) {
                if let cal = recipe.calories {
                    NutrientRow(label: L10n.calories, value: cal / recipe.totalServings, unit: "kcal", color: MacroColors.calories)
                }
                if let p = recipe.protein {
                    NutrientRow(label: L10n.protein, value: p / recipe.totalServings, unit: "g", color: MacroColors.protein)
                }
                if let c = recipe.carbs {
                    NutrientRow(label: L10n.carbs, value: c / recipe.totalServings, unit: "g", color: MacroColors.carbs)
                }
                if let f = recipe.fat {
                    NutrientRow(label: L10n.fat, value: f / recipe.totalServings, unit: "g", color: MacroColors.fat)
                }
                if let fb = recipe.fiber {
                    NutrientRow(label: L10n.fiber, value: fb / recipe.totalServings, unit: "g", color: MacroColors.fiber)
                }
            }

            if let ingredients = recipe.ingredients, !ingredients.isEmpty {
                Section(L10n.ingredients) {
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

            Section(L10n.totals) {
                if let cal = recipe.calories {
                    NutrientRow(label: L10n.calories, value: cal, unit: "kcal", color: MacroColors.calories)
                }
                if let p = recipe.protein {
                    NutrientRow(label: L10n.protein, value: p, unit: "g", color: MacroColors.protein)
                }
                if let c = recipe.carbs {
                    NutrientRow(label: L10n.carbs, value: c, unit: "g", color: MacroColors.carbs)
                }
                if let f = recipe.fat {
                    NutrientRow(label: L10n.fat, value: f, unit: "g", color: MacroColors.fat)
                }
                if let fb = recipe.fiber {
                    NutrientRow(label: L10n.fiber, value: fb, unit: "g", color: MacroColors.fiber)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Actions

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

    private func deleteRecipe() async {
        do {
            try await api.deleteRecipe(id: recipeId)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
