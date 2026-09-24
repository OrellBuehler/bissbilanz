// VisualIntelligence is absent from the iOS simulator SDK. Keep the
// framework import and its descriptor-based query behind the same guard.
#if canImport(VisualIntelligence)
import AppIntents
import os
import VisualIntelligence

/// TestFlight reported "Search results are limited." with no Bissbilanz
/// results and no way to tell what the system actually sent, so every query
/// below logs `input.labels` and its own result count — both through
/// `os.Logger` (visible in a sysdiagnose without Sentry) and as a Sentry
/// breadcrumb (visible in the next captured event, if any).
private let visualIntelligenceLogger = Logger(subsystem: "com.bissbilanz.ios", category: "visual-intelligence")

/// The app's single semantic-content query. Labels are normalized by the
/// repository using the same vocabulary as the food pickers. No camera-frame
/// processing or network requests are needed; unlabeled foods don't match.
@available(iOS 26.0, *)
struct FoodVisualIntelligenceQuery: IntentValueQuery {
    @Dependency private var entryWriter: EntryWriter

    func values(for input: SemanticContentDescriptor) async throws -> [FoodEntity] {
        let results = await entryWriter.foods(matchingLabels: input.labels).map(FoodEntity.init)
        visualIntelligenceLogger.info(
            "food query labels=\(input.labels, privacy: .public) results=\(results.count, privacy: .public)"
        )
        ErrorReporter.addBreadcrumb(
            "visual intelligence food query",
            category: "visual-intelligence",
            data: ["labels": input.labels, "result_count": results.count]
        )
        return results
    }
}

/// Apple's Visual Intelligence "more results" affordance: when the compact
/// sheet's own bounded matches aren't enough, the system can hand off to the
/// app's own search, prefilled with what it saw. `perform` reuses the same
/// deep-link routing `OpenFoodIntent` and the widgets already drive, opening
/// the food search screen with the first descriptor label that survives
/// normalization.
///
/// UNVERIFIED against a local SDK: this project builds on Linux/WSL, which
/// cannot see the VisualIntelligence framework's actual headers. The shape
/// below — `@AppIntent(schema: .visualIntelligence.semanticContentSearch)`,
/// a stored `semanticContent: SemanticContentDescriptor`, `openAppWhenRun`,
/// `perform() async throws -> some IntentResult` — matches Apple's published
/// WWDC25 "Explore new advances in App Intents" and WWDC26 "Best practices
/// for integrating visual intelligence in your app" sample code, but neither
/// could be compiled here to confirm. The iOS build in CI is the actual gate.
@available(iOS 26.0, *)
@AppIntent(schema: .visualIntelligence.semanticContentSearch)
struct FoodVisualIntelligenceSearchIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Search Bissbilanz"
    }

    static var openAppWhenRun: Bool {
        true
    }

    var semanticContent: SemanticContentDescriptor

    @Dependency
    private var deepLinkRouter: DeepLinkRouter

    @MainActor
    func perform() async throws -> some IntentResult {
        let query = semanticContent.labels.lazy.compactMap(LabelNormalizer.normalize).first ?? ""
        visualIntelligenceLogger.info(
            "food search-more labels=\(semanticContent.labels, privacy: .public) query=\(query, privacy: .public)"
        )
        ErrorReporter.addBreadcrumb(
            "visual intelligence search-more",
            category: "visual-intelligence",
            data: ["labels": semanticContent.labels, "query": query]
        )
        deepLinkRouter.pending = .foodSearch(query: query)
        return .result()
    }
}
#endif
