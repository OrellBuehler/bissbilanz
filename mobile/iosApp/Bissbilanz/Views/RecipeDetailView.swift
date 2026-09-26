import SwiftUI

struct RecipeDetailView: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModeManager.self) private var appMode

    let recipeId: String

    @State private var recipe: Recipe?
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showEditSheet = false
    @State private var showShareSheet = false
    @State private var showDeleteConfirmation = false
    @State private var showLogSheet = false
    @State private var errorMessage: String?
    @State private var deleteConflict: DeleteConflict?
    @State private var duplicatedRecipe: Recipe?
    @State private var isDuplicating = false
    // The server's recipe response has no embedded `food` on ingredients — resolved
    // separately (cache first, then API) so the list shows real names instead of
    // the raw food id.
    @State private var foodNames: [String: String] = [:]

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
                        Image(systemName: "plus")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                    }
                    .circularGlassBackground(tint: Color.accentColor)
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

                        Button {
                            Task { await duplicateRecipe() }
                        } label: {
                            Label(L10n.duplicateRecipe, systemImage: "doc.on.doc")
                        }
                        .disabled(isDuplicating)

                        // Sharing is server-built; not available in local mode.
                        if !appMode.isLocal {
                            Button {
                                showShareSheet = true
                            } label: {
                                Label(L10n.foodPackageShareRecipe, systemImage: "square.and.arrow.up")
                            }
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
        .sheet(isPresented: $showShareSheet) {
            FoodPackageExportView(recipeIds: [recipeId])
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
        .sheet(item: $duplicatedRecipe) { copy in
            RecipeEditSheet(recipe: copy) { _ in }
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
        .alert(
            L10n.stillInUse,
            isPresented: .init(get: { deleteConflict != nil }, set: { if !$0 { deleteConflict = nil } })
        ) {
            Button(L10n.deleteAnyway, role: .destructive) {
                deleteConflict = nil
                Task { await forceDeleteRecipe() }
            }
            Button(L10n.cancel, role: .cancel) { deleteConflict = nil }
        } message: {
            if let deleteConflict { Text(deleteConflict.message) }
        }
    }

    private func recipeContent(_ recipe: Recipe) -> some View {
        List {
            if recipe.imageUrl != nil {
                Section {
                    FoodImageView(imageUrl: recipe.imageUrl)
                        .frame(width: 200, height: 200)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .frame(maxWidth: .infinity)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }

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
                if let cookedWeight = recipe.cookedWeight {
                    HStack {
                        Text(L10n.cookedWeight)
                        Spacer()
                        if let perHundredG = recipe.caloriesPerHundredGrams {
                            Text(L10n.recipeCookedWeightSummary(grams: Int(cookedWeight), kcalPer100g: Int(perHundredG)))
                                .foregroundStyle(.secondary)
                        } else {
                            Text(L10n.recipeCookedWeightSummaryNoCalories(grams: Int(cookedWeight)))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section(L10n.perServing) {
                if let cal = recipe.caloriesPerServing {
                    NutrientRow(
                        label: L10n.calories,
                        value: cal,
                        unit: "kcal",
                        color: MacroColors.calories
                    )
                }
                if let p = recipe.proteinPerServing {
                    NutrientRow(
                        label: L10n.protein,
                        value: p,
                        unit: "g",
                        color: MacroColors.protein
                    )
                }
                if let c = recipe.carbsPerServing {
                    NutrientRow(label: L10n.carbs, value: c, unit: "g", color: MacroColors.carbs)
                }
                if let f = recipe.fatPerServing {
                    NutrientRow(label: L10n.fat, value: f, unit: "g", color: MacroColors.fat)
                }
                if let fb = recipe.fiberPerServing {
                    NutrientRow(
                        label: L10n.fiber,
                        value: fb,
                        unit: "g",
                        color: MacroColors.fiber
                    )
                }
            }

            if let ingredients = recipe.ingredients, !ingredients.isEmpty {
                Section(L10n.ingredients) {
                    ForEach(ingredients) { ingredient in
                        HStack {
                            Text(ingredient.food?.name ?? foodNames[ingredient.foodId] ?? L10n.unknownIngredient)
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
        recipe = recipeRepository.recipe(id: recipeId)
        isLoading = recipe == nil
        error = nil
        do {
            try await recipeRepository.refreshRecipe(id: recipeId)
            recipe = recipeRepository.recipe(id: recipeId) ?? recipe
        } catch {
            if recipe == nil { self.error = error }
        }
        isLoading = false
        if let recipe { await resolveFoodNames(for: recipe) }
    }

    private func resolveFoodNames(for recipe: Recipe) async {
        var names: [String: String] = [:]
        for ingredient in recipe.ingredients ?? [] {
            if let food = ingredient.food ?? foodRepository.food(id: ingredient.foodId) {
                names[ingredient.foodId] = food.name
                continue
            }
            try? await foodRepository.refreshFood(id: ingredient.foodId)
            if let food = foodRepository.food(id: ingredient.foodId) {
                names[ingredient.foodId] = food.name
            }
        }
        foodNames = names
    }

    private func deleteRecipe() async {
        do {
            switch try await recipeRepository.deleteRecipeChecked(id: recipeId) {
            case .deleted:
                dismiss()
            case let .blocked(conflict):
                deleteConflict = conflict
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func forceDeleteRecipe() async {
        do {
            try await recipeRepository.forceDeleteRecipe(id: recipeId)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Copies the recipe under a new name and opens the copy in the editor —
    /// see `RecipeRepository.duplicateRecipe` for why the image is never copied.
    private func duplicateRecipe() async {
        guard let recipe, !isDuplicating else { return }
        isDuplicating = true
        defer { isDuplicating = false }
        do {
            duplicatedRecipe = try await recipeRepository.duplicateRecipe(
                id: recipe.id,
                name: L10n.recipeCopyName(recipe.name)
            )
        } catch {
            if error is CancellationError { return }
            ErrorReporter.captureWarning("Recipe duplicate failed", context: ["reason": ErrorReporter.reason(for: error)])
            errorMessage = L10n.duplicateRecipeFailed
        }
    }
}
