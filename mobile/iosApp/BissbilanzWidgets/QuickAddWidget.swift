import SwiftUI
import WidgetKit

/// Dedicated quick-add surface: every row *is* the log action (no separate
/// navigation target like `FavoritesWidget`'s tiles), so the whole row is the
/// `Button(intent:)` hit target. `Button(intent:)` widgets are a home-screen
/// concept — no lock-screen accessory family here, matching the existing
/// `accessoryCircular`/`accessoryInline` widgets which stay navigation-only.
struct QuickAddWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.load()?.localeCode ?? "en")
        return StaticConfiguration(kind: "QuickAddWidget", provider: SnapshotProvider()) { entry in
            QuickAddWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.quickAddWidgetDisplayName)
        .description(strings.quickAddWidgetDescription)
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct QuickAddWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotTimelineEntry

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private var rowLimit: Int {
        family == .systemSmall ? 3 : 6
    }

    private var favorites: [WidgetSnapshot.FavoriteFood] {
        Array(snapshot.favorites.prefix(rowLimit))
    }

    var body: some View {
        Group {
            if favorites.isEmpty {
                emptyState
            } else {
                VStack(spacing: 6) {
                    ForEach(favorites) { food in
                        row(for: food)
                    }
                }
            }
        }
        .widgetURL(WidgetDeepLink.today)
        .bissbilanzWidgetBackground()
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "plus.circle")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(strings.noFavorites)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func row(for food: WidgetSnapshot.FavoriteFood) -> some View {
        Button(intent: QuickAddFoodIntent(foodId: food.id, foodName: food.name)) {
            HStack(spacing: 8) {
                Image(systemName: "plus.circle.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, MacroColors.calories)
                VStack(alignment: .leading, spacing: 1) {
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
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}
