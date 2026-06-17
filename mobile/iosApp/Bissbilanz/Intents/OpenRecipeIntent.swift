import AppIntents
import Foundation

/// Opens a recipe's detail screen — recipe counterpart of `OpenFoodIntent`,
/// driven by a Spotlight tap on a recipe result.
struct OpenRecipeIntent: OpenIntent {
    static var title: LocalizedStringResource {
        "Open Recipe"
    }

    @Parameter(title: "Recipe")
    var target: RecipeEntity

    @Dependency
    private var deepLinkRouter: DeepLinkRouter

    @MainActor
    func perform() async throws -> some IntentResult {
        deepLinkRouter.pending = .recipe(target.id)
        return .result()
    }
}
