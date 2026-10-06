import SwiftUI

/// Sequential, cancellable sweep over every local food and recipe with no labels
/// yet, suggesting and saving labels for each in turn through the one
/// `FoodLabeler`. Pushed from `SettingsView`'s "Food labels" section. `.task` starts the sweep as soon as the view
/// appears and SwiftUI cancels it automatically when the view goes away
/// (navigating back), so `runSweep` only needs to check `Task.isCancelled`
/// between items to stop promptly.
struct LabelUnlabeledFoodsView: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(FoodLabeler.self) private var foodLabeler
    @Environment(FoodImageLoader.self) private var foodImageLoader

    @State private var done = 0
    @State private var total = 0
    @State private var currentItemName: String?
    @State private var labelledCount = 0
    @State private var failedCount = 0
    @State private var isFinished = false

    var body: some View {
        List {
            // What's actually happening: TestFlight feedback was that a bare
            // progress bar left it unclear what the sweep does or where the
            // data goes, so this stays visible for the whole run, not just
            // while idle.
            Section {
                Text(L10n.labelSweepExplanation(provider: FoodLabelProviderSettings.selected))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                if isFinished {
                    Label {
                        Text(L10n.foodLabelSweepSummary(labelled: labelledCount, failed: failedCount))
                    } icon: {
                        Image(systemName: "checkmark.circle")
                            .foregroundStyle(.green)
                    }
                } else {
                    HStack(spacing: 12) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.foodLabelSweepProgress(done, total))
                                .font(.subheadline)
                            if let currentItemName {
                                Text(currentItemName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    ProgressView(value: total > 0 ? Double(done) / Double(total) : 0)
                }
            }
        }
        .navigationTitle(L10n.labelUnlabeledFoods)
        .navigationBarTitleDisplayMode(.inline)
        .task { await runSweep() }
    }

    private func runSweep() async {
        let foods = foodRepository.unlabeledLocalFoods()
        let recipes = recipeRepository.unlabeledLocalRecipes()
        total = foods.count + recipes.count
        for food in foods {
            if Task.isCancelled { return }
            currentItemName = food.name
            do {
                let image = await foodImageLoader.image(for: food.imageUrl)
                let suggestions = try await foodLabeler.labels(for: FoodLabelInput(
                    name: food.name,
                    brand: food.brand,
                    servingUnit: food.servingUnit,
                    ingredientsText: food.ingredientsText,
                    image: image
                ))
                if !suggestions.isEmpty {
                    try await foodRepository.addGeneratedLabels(id: food.id, labels: suggestions)
                }
                labelledCount += 1
            } catch {
                failedCount += 1
                ErrorReporter.captureWarning(
                    "Label sweep item failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.food_id": food.id]
                )
            }
            done += 1
        }
        for listed in recipes {
            if Task.isCancelled { return }
            currentItemName = listed.name
            do {
                let recipe = await withIngredients(listed)
                let image = await foodImageLoader.image(for: recipe.imageUrl)
                let suggestions = try await foodLabeler.labels(for: FoodLabelInput(
                    recipeName: recipe.name,
                    ingredientNames: recipeRepository.ingredientFoodNames(of: recipe),
                    image: image
                ))
                if !suggestions.isEmpty {
                    try await recipeRepository.addGeneratedLabels(id: recipe.id, labels: suggestions)
                }
                labelledCount += 1
            } catch {
                failedCount += 1
                ErrorReporter.captureWarning(
                    "Label sweep item failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.recipe_id": listed.id]
                )
            }
            done += 1
        }
        currentItemName = nil
        isFinished = true
    }

    /// The list endpoint carries no ingredients, so a recipe cached from it alone
    /// is fetched in full first; without them the labeller would only see the
    /// name. A failed fetch is reported and the sweep goes on with what it has.
    private func withIngredients(_ recipe: Recipe) async -> Recipe {
        guard recipe.ingredients == nil else { return recipe }
        do {
            try await recipeRepository.refreshRecipe(id: recipe.id)
        } catch {
            ErrorReporter.captureWarning(
                "Label sweep recipe refresh failed",
                context: ["reason": ErrorReporter.reason(for: error), "sync.recipe_id": recipe.id]
            )
        }
        return recipeRepository.recipe(id: recipe.id) ?? recipe
    }
}
