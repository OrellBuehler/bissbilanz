import Foundation
import Observation

enum FoodLabelSweepState: Equatable {
    case idle
    case running
    case completed
    case stopped
}

struct FoodLabelSweepProgress: Equatable {
    var state: FoodLabelSweepState = .idle
    var total = 0
    var done = 0
    var labelled = 0
    var failed = 0
    var currentItemName: String?
}

/// The bulk labelling sweep over every local food and recipe with no labels
/// yet. It lives here rather than in `LabelUnlabeledFoodsView` so it keeps
/// running after the screen is left, the same way `FoodEnrichmentController`
/// owns the local Enhance Foods sweep.
@MainActor
@Observable
final class FoodLabelSweepController {
    private(set) var progress = FoodLabelSweepProgress()

    @ObservationIgnored private let foodRepository: FoodRepository
    @ObservationIgnored private let recipeRepository: RecipeRepository
    @ObservationIgnored private let foodLabeler: FoodLabeler
    @ObservationIgnored private let foodImageLoader: FoodImageLoader
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var sweepTask: Task<Void, Never>?

    init(
        foodRepository: FoodRepository,
        recipeRepository: RecipeRepository,
        foodLabeler: FoodLabeler,
        foodImageLoader: FoodImageLoader
    ) {
        self.foodRepository = foodRepository
        self.recipeRepository = recipeRepository
        self.foodLabeler = foodLabeler
        self.foodImageLoader = foodImageLoader
    }

    var isRunning: Bool {
        progress.state == .running
    }

    func start() {
        guard sweepTask == nil else { return }
        let current = generation
        progress = FoodLabelSweepProgress(state: .running)
        sweepTask = Task { [weak self] in
            guard let self else { return }
            let finalState = await runSweep(generation: current)
            guard current == generation else { return }
            progress.currentItemName = nil
            progress.state = finalState
            sweepTask = nil
        }
    }

    func stop() {
        sweepTask?.cancel()
    }

    func reset() {
        generation += 1
        sweepTask?.cancel()
        sweepTask = nil
        progress = FoodLabelSweepProgress()
    }

    private func isCurrentSweep(_ current: Int) -> Bool {
        !Task.isCancelled && current == generation
    }

    private func runSweep(generation current: Int) async -> FoodLabelSweepState {
        let foods = foodRepository.unlabeledLocalFoods()
        let recipes = recipeRepository.unlabeledLocalRecipes()
        progress.total = foods.count + recipes.count
        for food in foods {
            guard isCurrentSweep(current) else { return .stopped }
            progress.currentItemName = food.name
            let succeeded = await label(food)
            guard current == generation else { return .stopped }
            record(succeeded)
        }
        for recipe in recipes {
            guard isCurrentSweep(current) else { return .stopped }
            progress.currentItemName = recipe.name
            let succeeded = await label(recipe)
            guard current == generation else { return .stopped }
            record(succeeded)
        }
        return .completed
    }

    /// A stop lands in the middle of an item, so that item counts as neither
    /// labelled nor failed.
    private func record(_ succeeded: Bool?) {
        guard let succeeded else { return }
        if succeeded {
            progress.labelled += 1
        } else {
            progress.failed += 1
        }
        progress.done += 1
    }

    private func label(_ food: Food) async -> Bool? {
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
            return true
        } catch {
            return reportFailure(error, context: ["sync.food_id": food.id])
        }
    }

    private func label(_ listed: Recipe) async -> Bool? {
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
            return true
        } catch {
            return reportFailure(error, context: ["sync.recipe_id": listed.id])
        }
    }

    private func reportFailure(_ error: Error, context: [String: Any]) -> Bool? {
        if Task.isCancelled || FoodEnrichmentController.isCancellation(error) {
            return nil
        }
        var context = context
        context["reason"] = ErrorReporter.reason(for: error)
        ErrorReporter.captureWarning("Label sweep item failed", context: context)
        return false
    }

    /// The list endpoint carries no ingredients, so a recipe cached from it alone
    /// is fetched in full first; without them the labeller would only see the
    /// name. A failed fetch is reported and the sweep goes on with what it has.
    private func withIngredients(_ recipe: Recipe) async -> Recipe {
        guard recipe.ingredients == nil else { return recipe }
        do {
            try await recipeRepository.refreshRecipe(id: recipe.id)
        } catch {
            if !Task.isCancelled, !FoodEnrichmentController.isCancellation(error) {
                ErrorReporter.captureWarning(
                    "Label sweep recipe refresh failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.recipe_id": recipe.id]
                )
            }
        }
        return recipeRepository.recipe(id: recipe.id) ?? recipe
    }
}
