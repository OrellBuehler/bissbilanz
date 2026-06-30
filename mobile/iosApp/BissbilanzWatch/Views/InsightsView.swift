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
            mealBreakdownPage
        }
        .tabViewStyle(.verticalPage)
    }

    /// Single-screen rings — sized to fit the smallest watch without scrolling.
    private var ringsPage: some View {
        VStack(spacing: 12) {
            calorieRing

            HStack(spacing: 8) {
                macroRing(snapshot.protein, snapshot.proteinGoal, MacroColors.protein, strings.protein)
                macroRing(snapshot.carbs, snapshot.carbGoal, MacroColors.carbs, strings.carbs)
                macroRing(snapshot.fat, snapshot.fatGoal, MacroColors.fat, strings.fat)
                macroRing(snapshot.fiber, snapshot.fiberGoal, MacroColors.fiber, strings.fiber)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var mealBreakdownPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(strings.byMeal)
                    .font(.headline)
                    .padding(.bottom, 2)

                if snapshot.meals.isEmpty {
                    Text(strings.noData)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                } else {
                    ForEach(snapshot.meals, id: \.mealType) { meal in
                        HStack {
                            Text(strings.mealName(meal.mealType))
                                .font(.callout)
                                .lineLimit(1)
                            Spacer(minLength: 6)
                            Text("\(strings.integer(meal.calories)) \(strings.kcal)")
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(MacroColors.calories)
                        }
                        Divider()
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private var calorieRing: some View {
        WatchMacroRing(
            value: snapshot.calories,
            goal: snapshot.calorieGoal,
            color: MacroColors.calories,
            lineWidth: 8
        ) {
            VStack(spacing: 0) {
                Text(strings.integer(snapshot.calories))
                    .font(.system(.title2, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(snapshot.calories > snapshot.calorieGoal && snapshot.calorieGoal > 0
                        ? .red : MacroColors.calories)
                Text("/ \(strings.integer(snapshot.calorieGoal)) \(strings.kcal)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .minimumScaleFactor(0.6)
            }
            .padding(.horizontal, 8)
        }
        .frame(width: 96, height: 96)
    }

    private func macroRing(_ value: Double, _ goal: Double, _ color: Color, _ label: String) -> some View {
        VStack(spacing: 3) {
            WatchMacroRing(value: value, goal: goal, color: color, lineWidth: 4) {
                Text(strings.integer(value))
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(value > goal && goal > 0 ? .red : color)
            }
            .frame(width: 34, height: 34)

            Text(label)
                .font(.system(size: 9))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
