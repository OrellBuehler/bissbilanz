import Foundation

/// Resolves a Favorites/Quick Add widget's configured food picks against
/// fresh display data, falling back to the snapshot's own favorites when
/// nothing was picked, or when every pick has since been deleted. Pure and
/// SwiftData-free so it's unit-testable without a `ModelContainer` —
/// `WidgetFoodEntityQuery.currentFoodsById()` does the actual store read.
enum WidgetFoodSelection {
    static func resolve(
        configuredFoods: [WidgetFoodEntity]?,
        available: [String: WidgetSnapshot.FavoriteFood],
        fallback: [WidgetSnapshot.FavoriteFood]
    ) -> [WidgetSnapshot.FavoriteFood] {
        let ids = (configuredFoods ?? []).map(\.id)
        guard !ids.isEmpty else { return fallback }
        let resolved = ids.compactMap { available[$0] }
        return resolved.isEmpty ? fallback : resolved
    }
}
