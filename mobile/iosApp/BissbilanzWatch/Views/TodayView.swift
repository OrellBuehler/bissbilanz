import SwiftUI

/// Glanceable rings for today's calories and macros, rendered from the synced
/// state (zeroed automatically when shown on a later day than it was captured).
struct TodayView: View {
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
        ScrollView {
            VStack(spacing: 14) {
                calorieRing

                HStack(spacing: 10) {
                    macroRing(snapshot.protein, snapshot.proteinGoal, MacroColors.protein, strings.protein)
                    macroRing(snapshot.carbs, snapshot.carbGoal, MacroColors.carbs, strings.carbs)
                    macroRing(snapshot.fat, snapshot.fatGoal, MacroColors.fat, strings.fat)
                    macroRing(snapshot.fiber, snapshot.fiberGoal, MacroColors.fiber, strings.fiber)
                }

                if let weight = snapshot.latestWeightKg {
                    Text(String(format: "%.1f kg", locale: Locale(identifier: "en_US_POSIX"), weight))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
        .navigationTitle(strings.today)
    }

    private var calorieRing: some View {
        WatchMacroRing(
            value: snapshot.calories,
            goal: snapshot.calorieGoal,
            color: MacroColors.calories,
            lineWidth: 9
        ) {
            VStack(spacing: 0) {
                Text(strings.integer(snapshot.calories))
                    .font(.system(.title, design: .rounded))
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
        .frame(width: 110, height: 110)
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
            .frame(width: 38, height: 38)

            Text(label)
                .font(.system(size: 9))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
