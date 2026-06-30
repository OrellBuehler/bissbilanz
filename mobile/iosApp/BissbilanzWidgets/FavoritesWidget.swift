import SwiftUI
import WidgetKit

/// Medium widget with the user's favorite foods — each tile deep-links to the
/// food in the app for one-tap logging (iOS counterpart of the Android
/// favorites widget).
struct FavoritesWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.load()?.localeCode ?? "en")
        return StaticConfiguration(kind: "FavoritesWidget", provider: SnapshotProvider()) { entry in
            FavoritesWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.localeCode == "de" ? "Favoriten" : "Favorites")
        .description(
            strings.localeCode == "de"
                ? "Lieblingsgerichte mit einem Tippen öffnen und eintragen."
                : "Open and log favorite foods with one tap."
        )
        .supportedFamilies([.systemMedium])
    }
}

struct FavoritesWidgetView: View {
    let entry: SnapshotTimelineEntry

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private var tiles: [WidgetSnapshot.FavoriteFood] {
        Array(snapshot.favorites.prefix(6))
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
            Text(food.name)
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(1)
                .foregroundStyle(.primary)
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
