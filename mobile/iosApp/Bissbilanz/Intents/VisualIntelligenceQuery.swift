import AppIntents
import VisualIntelligence

/// The app's single semantic-content query. Labels are normalized by the
/// repository using the same vocabulary as the food pickers. No camera-frame
/// processing or network requests are needed; unlabeled foods don't match.
@available(iOS 26.0, *)
struct FoodVisualIntelligenceQuery: IntentValueQuery {
    @Dependency private var entryWriter: EntryWriter

    func values(for input: SemanticContentDescriptor) async throws -> [FoodEntity] {
        await entryWriter.foods(matchingLabels: input.labels).map(FoodEntity.init)
    }
}
