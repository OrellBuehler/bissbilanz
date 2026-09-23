import AppIntents
import SwiftUI
import WidgetKit

/// Defaults to no picks (`nil`), which `WidgetFoodSelection` falls back to
/// today's favorites — the widget's existing behavior — for both freshly
/// added widgets and every widget already placed under the "FavoritesWidget"
/// kind before this parameter existed.
struct FavoritesWidgetConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Favorites Widget" }

    static var description: IntentDescription {
        IntentDescription("Choose which foods appear, or leave empty to show your favorites.")
    }

    @Parameter(title: "Foods")
    var foods: [WidgetFoodEntity]?

    init() {
        foods = nil
    }

    init(foods: [WidgetFoodEntity]?) {
        self.foods = foods
    }
}

struct FavoritesSnapshotProvider: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> FoodListSnapshotEntry {
        FoodListSnapshotEntry(date: Date(), snapshot: .placeholder, foods: WidgetSnapshot.placeholder.favorites, mealType: nil)
    }

    func snapshot(for configuration: FavoritesWidgetConfigurationIntent, in _: Context) async -> FoodListSnapshotEntry {
        await FoodListWidgetSupport.makeEntry(at: Date(), configuredFoods: configuration.foods, mealType: nil)
    }

    func timeline(for configuration: FavoritesWidgetConfigurationIntent, in _: Context) async -> Timeline<FoodListSnapshotEntry> {
        let now = Date()
        var entries = [await FoodListWidgetSupport.makeEntry(at: now, configuredFoods: configuration.foods, mealType: nil)]
        // Roll the displayed day over at midnight even if no refresh runs.
        if let midnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) {
            entries.append(await FoodListWidgetSupport.makeEntry(at: midnight, configuredFoods: configuration.foods, mealType: nil))
        }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60)))
    }
}

/// Medium widget with the user's chosen (or, by default, favorite) foods —
/// each tile deep-links to the food in the app for one-tap logging (iOS
/// counterpart of the Android favorites widget). Configurable since iOS 17 —
/// "Edit Widget" lets the user pick specific foods instead of favorites.
struct FavoritesWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return AppIntentConfiguration(
            kind: "FavoritesWidget",
            intent: FavoritesWidgetConfigurationIntent.self,
            provider: FavoritesSnapshotProvider()
        ) { entry in
            FavoritesWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.favoritesWidgetDisplayName)
        .description(strings.favoritesWidgetDescription)
        .supportedFamilies([.systemMedium])
    }
}

struct FavoritesWidgetView: View {
    let entry: FoodListSnapshotEntry

    private var strings: WidgetStrings {
        entry.snapshot.strings
    }

    private var tiles: [WidgetSnapshot.FavoriteFood] {
        Array(entry.foods.prefix(6))
    }

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        Group {
            if tiles.isEmpty {
                emptyState
            } else {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(tiles) { food in
                        tile(for: food)
                    }
                }
            }
        }
        .widgetURL(WidgetDeepLink.today)
        .bissbilanzWidgetBackground()
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "star")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(strings.noFavorites)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    /// Each tile offers two distinct actions that must not fight each other:
    /// tapping the tile body navigates to the food's detail screen (`Link`),
    /// while the "+" button quick-adds it in place (`Button(intent:)`, runs
    /// in the widget extension process — see `QuickAddFoodIntent`). The two
    /// are `ZStack` siblings, never nested, so SwiftUI doesn't have to
    /// arbitrate one gesture recognizer inside another.
    private func tile(for food: WidgetSnapshot.FavoriteFood) -> some View {
        ZStack(alignment: .bottomTrailing) {
            if let url = WidgetDeepLink.food(food.id) {
                Link(destination: url) {
                    tileContent(for: food)
                }
            } else {
                tileContent(for: food)
            }
            Button(intent: QuickAddFoodIntent(foodId: food.id, foodName: food.name)) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 20))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, MacroColors.calories)
            }
            .buttonStyle(.plain)
            .padding(6)
        }
    }

    private func tileContent(for food: WidgetSnapshot.FavoriteFood) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            // Sized to the caption line it sits on: a taller tile would push
            // the second grid row past the medium widget's canvas.
            HStack(spacing: 6) {
                if let thumbnail = WidgetFoodThumbnail(imageUrl: food.imageUrl, size: 18) {
                    thumbnail
                }
                Text(food.name)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            }
            Text("\(strings.integer(food.calories)) kcal")
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 22)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}
