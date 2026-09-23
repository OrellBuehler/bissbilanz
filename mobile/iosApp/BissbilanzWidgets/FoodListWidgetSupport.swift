import WidgetKit

/// Timeline entry shared by `FavoritesWidget` and `QuickAddWidget`: both
/// render a list of foods resolved from the widget's configuration, falling
/// back to the snapshot's favorites (see `WidgetFoodSelection`).
struct FoodListSnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
    let foods: [WidgetSnapshot.FavoriteFood]
    /// Set only for `QuickAddWidget`, whose configuration includes a meal
    /// picker; `nil` lets `QuickAddFoodIntent` fall back to time-of-day.
    /// `FavoritesWidget` has no meal picker — its tiles navigate to the food
    /// rather than logging it directly — so it always passes `nil`.
    let mealType: MealTypeAppEnum?
}

/// Builds one `FoodListSnapshotEntry`: resolves the configured foods against
/// a fresh store read, falling back to the day's snapshot favorites. Shared
/// by `FavoritesSnapshotProvider` and `QuickAddSnapshotProvider` so the
/// resolution rule lives in exactly one place.
enum FoodListWidgetSupport {
    @MainActor
    static func makeEntry(
        at date: Date,
        configuredFoods: [WidgetFoodEntity]?,
        mealType: MealTypeAppEnum?
    ) -> FoodListSnapshotEntry {
        let snapshot = WidgetSnapshotStore.currentSnapshot(at: date)
        let available = WidgetFoodEntityQuery.currentFoodsById()
        let foods = WidgetFoodSelection.resolve(configuredFoods: configuredFoods, available: available, fallback: snapshot.favorites)
        return FoodListSnapshotEntry(date: date, snapshot: snapshot, foods: foods, mealType: mealType)
    }
}
