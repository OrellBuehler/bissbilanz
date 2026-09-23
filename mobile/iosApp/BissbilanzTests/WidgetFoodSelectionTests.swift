import AppIntents
@testable import Bissbilanz
import Testing

/// `WidgetFoodEntityQuery`'s actual store read can't be unit-tested without a
/// live App Group container (see `QuickAddWriterTests`), so these exercise
/// the pure resolution rule it feeds into: `WidgetFoodSelection.resolve`.
struct WidgetFoodSelectionTests {
    private func food(_ id: String, name: String = "Food", calories: Double = 100) -> WidgetSnapshot.FavoriteFood {
        WidgetSnapshot.FavoriteFood(id: id, name: name, calories: calories)
    }

    private func entity(_ id: String) -> WidgetFoodEntity {
        WidgetFoodEntity(id: id, name: "ignored", calories: 0, imageUrl: nil)
    }

    @Test("Falls back to the snapshot's favorites when nothing was configured")
    func fallsBackWhenNothingConfigured() {
        let fallback = [food("f1")]
        let resolved = WidgetFoodSelection.resolve(configuredFoods: nil, available: [:], fallback: fallback)
        #expect(resolved.map(\.id) == ["f1"])
    }

    @Test("Falls back to favorites when configured with an empty list")
    func fallsBackWhenConfiguredEmpty() {
        let fallback = [food("f1")]
        let resolved = WidgetFoodSelection.resolve(configuredFoods: [], available: [:], fallback: fallback)
        #expect(resolved.map(\.id) == ["f1"])
    }

    @Test("Falls back when every configured pick has since been deleted")
    func fallsBackWhenPicksMissing() {
        let fallback = [food("f1")]
        let resolved = WidgetFoodSelection.resolve(
            configuredFoods: [entity("deleted")], available: [:], fallback: fallback
        )
        #expect(resolved.map(\.id) == ["f1"])
    }

    @Test("Resolves configured picks in the user's chosen order, with fresh data")
    func resolvesInConfiguredOrderWithFreshData() {
        let available = [
            "f1": food("f1", name: "Stale", calories: 999),
            "f2": food("f2", name: "Fresh", calories: 50),
        ]
        let resolved = WidgetFoodSelection.resolve(
            configuredFoods: [entity("f2"), entity("f1")],
            available: available,
            fallback: []
        )
        #expect(resolved.map(\.id) == ["f2", "f1"])
        #expect(resolved.map(\.calories) == [50, 999])
    }

    @Test("Drops picks that no longer exist but keeps the rest")
    func dropsMissingPicksButKeepsRest() {
        let available = ["f1": food("f1")]
        let resolved = WidgetFoodSelection.resolve(
            configuredFoods: [entity("f1"), entity("gone")], available: available, fallback: []
        )
        #expect(resolved.map(\.id) == ["f1"])
    }
}
