import SwiftUI

struct DashboardHeroCard: View {
    let totals: DashboardTotals
    let goals: Goals
    let activityBonus: Int
    let activityCalories: Int?

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .title) private var ringSize: CGFloat = 124

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .center, spacing: 16))
            : AnyLayout(HStackLayout(alignment: .center, spacing: 16))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            layout {
                MacroRingView(
                    label: nil,
                    accessibilityName: L10n.calories,
                    current: totals.calories,
                    goal: goals.calorieGoal,
                    macro: .calories,
                    showGoal: true,
                    size: min(ringSize, 168)
                )
                DashboardMacroBars(totals: totals, goals: goals)
            }
            DashboardHeroChips(activityBonus: activityBonus, activityCalories: activityCalories)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Brand.Spacing.card)
        .background(
            Brand.accent.opacity(0.05),
            in: RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
        )
        .cardSurface()
    }
}

private struct DashboardMacroBars: View {
    let totals: DashboardTotals
    let goals: Goals

    var body: some View {
        VStack(spacing: 10) {
            DashboardMacroBar(name: L10n.protein, current: totals.protein, goal: goals.proteinGoal, macro: .protein)
            DashboardMacroBar(name: L10n.carbs, current: totals.carbs, goal: goals.carbGoal, macro: .carbs)
            DashboardMacroBar(name: L10n.fat, current: totals.fat, goal: goals.fatGoal, macro: .fat)
            DashboardMacroBar(name: L10n.fiber, current: totals.fiber, goal: goals.fiberGoal, macro: .fiber)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct DashboardMacroBar: View {
    let name: String
    let current: Double
    let goal: Double
    let macro: AccessibleMacroColor.Macro

    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private var progress: Double {
        goal > 0 ? current / goal : 0
    }

    private var isOver: Bool {
        goal > 0 && current > goal
    }

    private var barColor: Color {
        isOver ? .red : AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    private var valueText: String {
        "\(MacroFormat.kcal(current)) / \(MacroFormat.kcal(goal)) g"
    }

    private var accessibilityValueText: String {
        let value = L10n.progressOfGoal(
            current: MacroFormat.kcal(current),
            goal: MacroFormat.kcal(goal),
            unit: L10n.gramsUnit
        )
        return isOver ? "\(value), \(L10n.overGoal)" : value
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(name)
                    .font(.brand(.caption, weight: .semibold))
                    .foregroundStyle(Brand.text)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if isOver, differentiateWithoutColor {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .accessibilityHidden(true)
                }
                Text(valueText)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(Brand.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            BrandProgressBar(value: progress, tint: barColor, height: 6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(name)
        .accessibilityValue(accessibilityValueText)
    }
}

private struct DashboardHeroChips: View {
    let activityBonus: Int
    let activityCalories: Int?

    private var showsActivity: Bool {
        (activityCalories ?? 0) > 0
    }

    var body: some View {
        if showsActivity || activityBonus > 0 {
            MacroTinted(macro: .activity) { tint in
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        chips(tint: tint)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        chips(tint: tint)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func chips(tint: Color) -> some View {
        if let activityCalories, activityCalories > 0 {
            Chip(L10n.daySummaryActivity(activityCalories), systemImage: "figure.run", tint: tint)
        }
        if activityBonus > 0 {
            Chip(L10n.daySummaryActivityBonus(activityBonus), systemImage: "plus.circle.fill", tint: tint)
        }
    }
}

struct DashboardDateNavigator: View {
    let date: Date
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onToday: () -> Void

    var body: some View {
        HStack {
            Button(action: onPrevious) {
                Image(systemName: "chevron.left")
                    .font(.brand(.headline, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(L10n.previousDay)

            Spacer()

            VStack(spacing: 2) {
                Text(L10n.dayLabel(date))
                    .font(.brand(.title3, weight: .bold))
                    .foregroundStyle(Brand.text)
                    .accessibilityAddTraits(.isHeader)
                if !date.isToday {
                    Button(L10n.goToToday, action: onToday)
                        .font(.brand(.caption, weight: .semibold))
                }
            }

            Spacer()

            Button(action: onNext) {
                Image(systemName: "chevron.right")
                    .font(.brand(.headline, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .disabled(date.isToday)
            .accessibilityLabel(L10n.nextDay)
        }
    }
}
