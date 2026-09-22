import SwiftUI

/// Insights tab: today's calorie + macro rings on a single screen (no scroll),
/// with a second vertical slide breaking the day down by meal. Values are read
/// from the synced state and zeroed automatically on a later day.
struct InsightsView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    private var state: WatchState {
        connectivity.state.resetIfStale(on: Date())
    }

    private var snapshot: WidgetSnapshot {
        state.snapshot
    }

    private var strings: WatchStrings {
        state.strings
    }

    var body: some View {
        TabView {
            ringsPage
                .watchTabBackground(MacroColors.calories)
            mealBreakdownPage
                .watchTabBackground(MacroColors.calories)
        }
        .tabViewStyle(.verticalPage)
        .navigationTitle(strings.today)
    }

    /// Single-screen rings — sized to fit the smallest watch without scrolling.
    private var ringsPage: some View {
        VStack(spacing: 10) {
            calorieRing

            HStack(spacing: 6) {
                macroRing(snapshot.protein, snapshot.proteinGoal, MacroColors.protein, strings.protein)
                macroRing(snapshot.carbs, snapshot.carbGoal, MacroColors.carbs, strings.carbs)
                macroRing(snapshot.fat, snapshot.fatGoal, MacroColors.fat, strings.fat)
                macroRing(snapshot.fiber, snapshot.fiberGoal, MacroColors.fiber, strings.fiber)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Each meal as a label, its calories and its share of the day — no
    /// dividers, just rhythm, like the Activity app's detail pages.
    private var mealBreakdownPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(strings.byMeal)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if snapshot.meals.isEmpty {
                    Text(connectivity.hasReceivedState ? strings.nothingLogged : strings.noData)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(snapshot.meals, id: \.mealType) { meal in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(strings.mealName(meal.mealType))
                                    .font(.footnote)
                                    .lineLimit(1)
                                Spacer(minLength: 6)
                                Text(strings.integer(meal.calories))
                                    .font(.system(.body, design: .rounded))
                                    .fontWeight(.semibold)
                                    .monospacedDigit()
                                    .foregroundStyle(MacroColors.calories)
                            }
                            ShareBar(fraction: snapshot.calories > 0 ? meal.calories / snapshot.calories : 0)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var calorieRing: some View {
        WatchMacroRing(
            value: snapshot.calories,
            goal: snapshot.calorieGoal,
            color: MacroColors.calories,
            lineWidth: 9
        ) {
            VStack(spacing: -2) {
                Text(strings.integer(snapshot.calories))
                    .font(.system(.title2, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(snapshot.calories > snapshot.calorieGoal && snapshot.calorieGoal > 0
                        ? .red : .primary)
                Text("/ \(strings.integer(snapshot.calorieGoal))")
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .minimumScaleFactor(0.6)
            }
            .padding(.horizontal, 10)
        }
        .frame(width: 92, height: 92)
    }

    private func macroRing(_ value: Double, _ goal: Double, _ color: Color, _ label: String) -> some View {
        VStack(spacing: 3) {
            WatchMacroRing(value: value, goal: goal, color: color, lineWidth: 4) {
                Text(strings.integer(value))
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(value > goal && goal > 0 ? .red : .primary)
            }
            .frame(width: 34, height: 34)

            Text(label)
                .font(.system(size: 9))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Thin capsule showing a meal's share of the day's calories.
private struct ShareBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(MacroColors.calories.opacity(0.2))
                Capsule()
                    .fill(MacroColors.calories)
                    .frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 4)
    }
}
