import AppIntents
import Foundation

/// Opens a food's detail screen. The system runs this when the user taps the
/// food's Spotlight result (an `OpenIntent` whose `target` matches the indexed
/// entity), and it also shows up in Shortcuts as "Open Food". Routing reuses
/// the existing deep-link plumbing the widgets already drive.
struct OpenFoodIntent: OpenIntent {
    static var title: LocalizedStringResource {
        "Open Food"
    }

    @Parameter(title: "Food")
    var target: FoodEntity

    @Dependency
    private var deepLinkRouter: DeepLinkRouter

    @MainActor
    func perform() async throws -> some IntentResult {
        deepLinkRouter.pending = .food(target.id)
        return .result()
    }
}
