import AppIntents
import SwiftUI
import WidgetKit

/// Defaults to no picks and no meal (`nil`/`nil`), which fall back to
/// today's favorites and time-of-day respectively — the widget's existing
/// behavior — for both freshly added widgets and every widget already
/// placed under the "QuickAddWidget" kind before these parameters existed.
struct QuickAddWidgetConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Quick Add Widget" }

    static var description: IntentDescription {
        IntentDescription("Choose which foods appear and which meal they log to.")
    }

    @Parameter(title: "Foods")
    var foods: [WidgetFoodEntity]?

    @Parameter(title: "Meal")
    var mealType: MealTypeAppEnum?

    init() {
        foods = nil
        mealType = nil
    }

    init(foods: [WidgetFoodEntity]?, mealType: MealTypeAppEnum?) {
        self.foods = foods
        self.mealType = mealType
    }
}

struct QuickAddSnapshotProvider: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> FoodListSnapshotEntry {
        FoodListSnapshotEntry(date: Date(), snapshot: .placeholder, foods: WidgetSnapshot.placeholder.favorites, mealType: nil)
    }

    func snapshot(for configuration: QuickAddWidgetConfigurationIntent, in _: Context) async -> FoodListSnapshotEntry {
        await FoodListWidgetSupport.makeEntry(at: Date(), configuredFoods: configuration.foods, mealType: configuration.mealType)
    }

    func timeline(for configuration: QuickAddWidgetConfigurationIntent, in _: Context) async -> Timeline<FoodListSnapshotEntry> {
        let now = Date()
        var entries = [
            await FoodListWidgetSupport.makeEntry(at: now, configuredFoods: configuration.foods, mealType: configuration.mealType),
        ]
        // Roll the displayed day over at midnight even if no refresh runs.
        if let midnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) {
            entries.append(await FoodListWidgetSupport.makeEntry(
                at: midnight, configuredFoods: configuration.foods, mealType: configuration.mealType
            ))
        }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60)))
    }
}

/// Dedicated quick-add surface: every row *is* the log action (no separate
/// navigation target like `FavoritesWidget`'s tiles), so the whole row is the
/// `Button(intent:)` hit target. `Button(intent:)` widgets are a home-screen
/// concept — no lock-screen accessory family here, matching the existing
/// `accessoryCircular`/`accessoryInline` widgets which stay navigation-only.
/// Configurable since iOS 17 — "Edit Widget" lets the user pick specific
/// foods (instead of favorites) and a fixed meal to log them to (instead of
/// time-of-day).
struct QuickAddWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return AppIntentConfiguration(
            kind: "QuickAddWidget",
            intent: QuickAddWidgetConfigurationIntent.self,
            provider: QuickAddSnapshotProvider()
        ) { entry in
            QuickAddWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.quickAddWidgetDisplayName)
        .description(strings.quickAddWidgetDescription)
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct QuickAddWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FoodListSnapshotEntry

    private var strings: WidgetStrings {
        entry.snapshot.strings
    }

    private var rowLimit: Int {
        family == .systemSmall ? 3 : 6
    }

    private var foods: [WidgetSnapshot.FavoriteFood] {
        Array(entry.foods.prefix(rowLimit))
    }

    var body: some View {
        Group {
            if foods.isEmpty {
                emptyState
            } else {
                VStack(spacing: 6) {
                    ForEach(foods) { food in
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
        Button(intent: QuickAddFoodIntent(foodId: food.id, foodName: food.name, meal: entry.mealType)) {
            HStack(spacing: 8) {
                Image(systemName: "plus.circle.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, MacroColors.calories)
                if let thumbnail = WidgetFoodThumbnail(imageUrl: food.imageUrl, size: 24) {
                    thumbnail
                }
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
