import SwiftUI

enum RecipeSourceError: LocalizedError {
    case noIngredients

    var errorDescription: String? {
        switch self {
        case .noIngredients: L10n.addFromRecipeNoIngredients
        }
    }
}

/// Recipe search step for "Add from recipe", pushed within the recipe editor's
/// stack. Picking a recipe pushes `RecipeAmountStep`; confirming there copies
/// the scaled ingredients into the editor and `onAdd` pops back to it.
struct RecipeSourcePicker: View {
    @Environment(RecipeRepository.self) private var recipeRepository

    let currentIngredientCount: Int
    var excludeRecipeId: String?
    let onAdd: ([RecipeIngredient], Double) async -> Void

    @State private var recipes: [Recipe] = []
    @State private var isLoading = true
    @State private var hasLoaded = false
    @State private var errorMessage: String?
    @State private var query = ""

    nonisolated static func candidates(_ recipes: [Recipe], excluding id: String?) -> [Recipe] {
        guard let id else { return recipes }
        return recipes.filter { $0.id != id }
    }

    private var filteredRecipes: [Recipe] {
        let candidates = Self.candidates(recipes, excluding: excludeRecipeId)
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return RecipeSearch.matching(candidates, query: trimmed)
        }
        return candidates.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let errorMessage, recipes.isEmpty {
                ContentUnavailableView(
                    L10n.error,
                    systemImage: "exclamationmark.triangle",
                    description: Text(errorMessage)
                )
            } else if recipes.isEmpty {
                ContentUnavailableView(L10n.recipeSuggestionsNoRecipesTitle, systemImage: "book.closed")
            } else if filteredRecipes.isEmpty {
                ContentUnavailableView(
                    L10n.noResults,
                    systemImage: "magnifyingglass",
                    description: Text(query)
                )
            } else {
                List(filteredRecipes) { recipe in
                    NavigationLink {
                        RecipeAmountStep(recipe: recipe, currentIngredientCount: currentIngredientCount, onAdd: onAdd)
                    } label: {
                        recipeRow(recipe)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(L10n.addFromRecipeSelectTitle)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: L10n.addFromRecipeSearchPrompt)
        .task { await load() }
    }

    private func recipeRow(_ recipe: Recipe) -> some View {
        HStack(spacing: 12) {
            if recipe.imageUrl != nil {
                FoodImageView(imageUrl: recipe.imageUrl)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.name)
                    .foregroundStyle(.primary)
                HStack(spacing: 8) {
                    if let calories = recipe.caloriesPerServing {
                        Text("\(Int(calories)) \(L10n.calories.lowercased())/\(L10n.servings.lowercased())")
                    }
                    Text("\(MacroFormat.nutrient(recipe.totalServings)) \(L10n.servings.lowercased())")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        guard !hasLoaded else { return }
        recipes = recipeRepository.recipes()
        isLoading = recipes.isEmpty
        do {
            try await recipeRepository.refresh()
            recipes = recipeRepository.recipes()
        } catch {
            ErrorReporter.captureWarning(
                "Recipe source list refresh failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            if recipes.isEmpty { errorMessage = error.localizedDescription }
        }
        isLoading = false
        hasLoaded = true
    }
}

/// Amount step: how much of the source recipe to copy, as servings or (when it
/// has a cooked weight) grams, with a calorie preview. Nothing is added until
/// the user confirms, and the ingredients are only fetched then.
struct RecipeAmountStep: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(AppModeManager.self) private var appMode

    let recipe: Recipe
    let currentIngredientCount: Int
    let onAdd: ([RecipeIngredient], Double) async -> Void

    @State private var amountText: String
    @State private var mode: RecipeScaleMode = .servings
    @State private var isAdding = false
    @State private var errorMessage: String?

    init(recipe: Recipe, currentIngredientCount: Int, onAdd: @escaping ([RecipeIngredient], Double) async -> Void) {
        self.recipe = recipe
        self.currentIngredientCount = currentIngredientCount
        self.onAdd = onAdd
        _amountText = State(initialValue: Self.formatted(recipe.totalServings))
    }

    private var hasCookedWeight: Bool { (recipe.cookedWeight ?? 0) > 0 }

    private var factor: Double? {
        guard let amount = Double.parseUserInput(amountText) else { return nil }
        return recipeScaleFactor(
            totalServings: recipe.totalServings,
            cookedWeight: recipe.cookedWeight,
            amount: amount,
            mode: mode
        )
    }

    private var amountHint: String {
        switch mode {
        case .servings: L10n.addFromRecipeOfServings(Self.formatted(recipe.totalServings))
        case .grams: L10n.addFromRecipeOfGrams(Self.formatted(recipe.cookedWeight ?? 0))
        }
    }

    var body: some View {
        Form {
            Section {
                if hasCookedWeight {
                    Picker(L10n.amount, selection: $mode) {
                        Text(L10n.logByServings).tag(RecipeScaleMode.servings)
                        Text(L10n.logByWeight).tag(RecipeScaleMode.grams)
                    }
                    .pickerStyle(.segmented)
                }
                HStack {
                    TextField("", text: $amountText)
                        .keyboardType(.decimalPad)
                        .accessibilityLabel(L10n.amount)
                    Spacer()
                    Text(amountHint)
                        .foregroundStyle(.secondary)
                }
                if let factor, let calories = recipe.calories {
                    Text(L10n.addFromRecipePreview(Int((calories * factor).rounded())))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text(recipe.name)
            } footer: {
                Text(L10n.addFromRecipeSnapshotFooter)
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
        .navigationTitle(L10n.amount)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.addFromRecipeConfirm) {
                    Task { await add() }
                }
                .disabled(factor == nil || isAdding)
                .fontWeight(.semibold)
            }
        }
        .onChange(of: mode) { _, newMode in
            switch newMode {
            case .servings: amountText = Self.formatted(recipe.totalServings)
            case .grams: amountText = Self.formatted(recipe.cookedWeight ?? 0)
            }
        }
    }

    private static func formatted(_ value: Double) -> String {
        value == value.rounded() ? "\(Int(value))" : "\(value)"
    }

    private func add() async {
        guard let factor else { return }
        isAdding = true
        errorMessage = nil
        defer { isAdding = false }
        do {
            let source = try await Self.sourceIngredients(
                of: recipe,
                recipeRepository: recipeRepository,
                appMode: appMode
            )
            guard currentIngredientCount + source.count <= RecipeIngredientLimits.maxIngredients else {
                errorMessage = L10n.addFromRecipeTooMany(RecipeIngredientLimits.maxIngredients)
                return
            }
            await onAdd(source, factor)
        } catch let error as RecipeSourceError {
            errorMessage = error.localizedDescription
        } catch {
            ErrorReporter.captureWarning(
                "Add from recipe failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            errorMessage = L10n.addFromRecipeFailed
        }
    }

    /// The source recipe's ingredients in display order: the cached detail when it
    /// has any, otherwise the detail refreshed from the server (the list endpoint
    /// carries none). Throws the refresh error when that fails, and
    /// `RecipeSourceError.noIngredients` when there is still nothing to copy.
    /// Internal (not private) so it's directly testable.
    @MainActor
    static func sourceIngredients(
        of recipe: Recipe,
        recipeRepository: RecipeRepository,
        appMode: AppModeManager
    ) async throws -> [RecipeIngredient] {
        var current = recipeRepository.recipe(id: recipe.id) ?? recipe
        if (current.ingredients ?? []).isEmpty, !appMode.isLocal, !LocalStore.isTempId(recipe.id) {
            try await recipeRepository.refreshRecipe(id: recipe.id)
            current = recipeRepository.recipe(id: recipe.id) ?? current
        }
        guard let ingredients = current.ingredients, !ingredients.isEmpty else {
            throw RecipeSourceError.noIngredients
        }
        return ingredients.sorted { $0.sortOrder < $1.sortOrder }
    }
}
