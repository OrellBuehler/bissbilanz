import Foundation

/// Device-local toggle for whether a newly created/edited food or recipe with no
/// labels yet gets an automatic labelling pass (`FoodAutoLabeler.labelIfNeeded`),
/// using whichever provider `FoodLabelProviderSettings.selected` names. Same
/// local-only reasoning as `PrivateCloudComputeSettings`: whether this device
/// runs the model at all is a property of the device, not the account.
///
/// Defaults to on: the labeller only ever fires when the food or recipe has no labels
/// yet (never overwrites a user's or a scan's own choice) and the selected
/// provider can actually produce something (`FoodLabeler.isAvailable`) — which
/// is false while the provider is "AI assistant (MCP)", leaving it to the
/// assistant exactly like before.
enum FoodAutoLabelSettings {
    private static let key = "food_auto_label_enabled"

    static var isEnabled: Bool {
        get {
            guard UserDefaults.standard.object(forKey: key) != nil else { return true }
            return UserDefaults.standard.bool(forKey: key)
        }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

/// Fires the unattended labelling pass for a food, or a recipe, right after
/// it's created or saved (`FoodEditSheet`, `BarcodeScannerView`,
/// `RecipeEditSheet`). Runs in the background —
/// callers don't await it — and stays silent on failure beyond a logged
/// warning, since it's a best-effort convenience, not something the user is
/// waiting on.
@MainActor
enum FoodAutoLabeler {
    static func labelIfNeeded(
        _ food: Food,
        labeler: FoodLabeler,
        foodRepository: FoodRepository,
        foodImageLoader: FoodImageLoader
    ) {
        guard FoodAutoLabelSettings.isEnabled,
              (food.labels ?? []).isEmpty,
              labeler.isAvailable
        else { return }

        Task {
            do {
                let image = await foodImageLoader.image(for: food.imageUrl)
                let suggestions = try await labeler.labels(for: FoodLabelInput(
                    name: food.name,
                    brand: food.brand,
                    servingUnit: food.servingUnit,
                    ingredientsText: food.ingredientsText,
                    image: image
                ))
                guard !suggestions.isEmpty else { return }
                try await foodRepository.addGeneratedLabels(id: food.id, labels: suggestions)
            } catch {
                ErrorReporter.captureWarning(
                    "Automatic food labelling failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.food_id": food.id]
                )
            }
        }
    }

    /// The recipe counterpart: the same labeller, with the recipe's name, its
    /// ingredients' food names (looked up in the local food mirror) and its
    /// photo as input, and the results written as generated labels.
    static func labelIfNeeded(
        _ recipe: Recipe,
        labeler: FoodLabeler,
        recipeRepository: RecipeRepository,
        foodImageLoader: FoodImageLoader
    ) {
        guard FoodAutoLabelSettings.isEnabled,
              (recipe.labels ?? []).isEmpty,
              labeler.isAvailable
        else { return }

        Task {
            do {
                let image = await foodImageLoader.image(for: recipe.imageUrl)
                let suggestions = try await labeler.labels(for: FoodLabelInput(
                    recipeName: recipe.name,
                    ingredientNames: recipeRepository.ingredientFoodNames(of: recipe),
                    image: image
                ))
                guard !suggestions.isEmpty else { return }
                try await recipeRepository.addGeneratedLabels(id: recipe.id, labels: suggestions)
            } catch {
                ErrorReporter.captureWarning(
                    "Automatic recipe labelling failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.recipe_id": recipe.id]
                )
            }
        }
    }
}
