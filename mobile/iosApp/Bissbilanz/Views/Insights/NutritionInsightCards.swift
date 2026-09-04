import shared
import SwiftUI

// The Nutrition tab's ten cards. Each mirrors its Android counterpart in
// `ui/components/insights/`: same section id, same strings, same thresholds and
// colours. The numbers all come from the shared `InsightsBundle`, so nothing here
// computes anything — these views only decide how a result is shown.

struct NOVAScoreCard: View {
    let result: NOVAResult

    private var headlineTint: Color {
        switch result.ultraProcessedPct {
        case ..<30: MacroColors.fiber
        case ..<50: MacroColors.carbs
        default: MacroColors.protein
        }
    }

    /// NOVA 1–4, each with the colour Android gives it.
    private struct Group: Identifiable {
        let id: Int
        let label: String
        let tint: Color
    }

    private var groups: [Group] {
        [
            Group(id: 1, label: L10n.insightsNovaGroup1, tint: MacroColors.fiber),
            Group(id: 2, label: L10n.foodDetailNova2, tint: MacroColors.calories),
            Group(id: 3, label: L10n.foodDetailNova3, tint: MacroColors.carbs),
            Group(id: 4, label: L10n.insightsNovaGroup4, tint: MacroColors.protein),
        ]
    }

    var body: some View {
        InsightCardView(title: L10n.insightsNovaScoreTitle, sectionId: "nova_score") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsFoodEntries7)
            } else {
                HStack(alignment: .top) {
                    InsightHeadline(
                        value: "\(result.ultraProcessedPct.rounded0)%",
                        caption: L10n.insightsNovaUltraProcessedLabel,
                        tint: headlineTint
                    )
                    Text(L10n.insightsNovaTaggedPct(result.coveragePct.rounded0))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                InsightFootnote(
                    text: L10n.insightsNovaBasedOn(Int(result.sampleSize), result.coveragePct.rounded0)
                )
                let distribution = result.groupDistribution.swiftDoubles
                let totalKcal = distribution.values.reduce(0, +)
                ForEach(groups) { group in
                    if let kcal = distribution[group.id] {
                        let pct = totalKcal > 0 ? kcal / totalKcal * 100 : 0
                        InsightRow(
                            label: L10n.insightsNovaRowFormat(group.id, group.label),
                            value: "\(pct.rounded0)%",
                            tint: group.tint
                        )
                    }
                }
            }
        }
    }
}

struct OmegaRatioCard: View {
    let result: OmegaResult

    private var statusTint: Color {
        switch result.status {
        case "optimal": MacroColors.fiber
        case "elevated": MacroColors.calories
        case "high": MacroColors.carbs
        default: MacroColors.protein
        }
    }

    private var statusLabel: String {
        switch result.status {
        case "optimal": L10n.insightsOmegaOptimal
        case "elevated": L10n.insightsOmegaElevated
        case "high": L10n.insightsOmegaHigh
        default: L10n.insightsOmegaCritical
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsOmegaRatioTitle, sectionId: "omega_ratio") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsOmegaDays7)
            } else {
                HStack(alignment: .top) {
                    InsightHeadline(
                        value: result.ratio.map { "\($0.doubleValue.rounded1):1" } ?? "—",
                        caption: L10n.insightsOmegaRatioLabel,
                        tint: statusTint
                    )
                    Text(statusLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(statusTint)
                }
                HStack {
                    omegaStat(result.avgOmega3, name: L10n.nutrientOmega3, tint: MacroColors.fiber)
                    omegaStat(result.avgOmega6, name: L10n.nutrientOmega6, tint: MacroColors.carbs)
                }
                InsightFootnote(text: L10n.insightsOmegaIdealRatio)
            }
        }
    }

    private func omegaStat(_ grams: Double, name: String, tint: Color) -> some View {
        VStack(spacing: 2) {
            Text(L10n.insightsGramsPerDay(grams.rounded1))
                .font(.headline)
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(name)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct DIIScoreCard: View {
    let result: DIIResult

    private var classificationLabel: String {
        switch result.classification {
        case "anti-inflammatory", "anti_inflammatory": L10n.insightsDiiAntiInflammatory
        case "mildly_pro_inflammatory": L10n.insightsDiiMildlyProInflammatory
        case "pro-inflammatory", "pro_inflammatory": L10n.insightsDiiProInflammatory
        default: L10n.insightsDiiNeutral
        }
    }

    private var classificationTint: Color {
        switch result.classification {
        case "anti-inflammatory", "anti_inflammatory": MacroColors.fiber
        case "mildly_pro_inflammatory": MacroColors.carbs
        case "pro-inflammatory", "pro_inflammatory": MacroColors.protein
        default: .secondary
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsDiiTitle, sectionId: "dii_score") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsFoodDays7)
            } else {
                HStack(alignment: .top) {
                    InsightHeadline(
                        value: result.score.rounded1,
                        caption: L10n.insightsDiiScoreLabel,
                        tint: result.score < 0 ? MacroColors.fiber : MacroColors.protein
                    )
                    Text(classificationLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(classificationTint)
                }
                if !result.contributors.isEmpty {
                    Text(L10n.insightsDiiTopContributors)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(result.contributors.prefix(3), id: \.nutrient) { contributor in
                        InsightRow(
                            label: nutrientDisplayName(contributor.nutrient),
                            value: contributor.impact.signedRounded2,
                            tint: contributor.impact < 0 ? MacroColors.fiber : MacroColors.protein
                        )
                    }
                }
            }
        }
    }
}

struct TEFCard: View {
    let result: TEFResult

    var body: some View {
        InsightCardView(title: L10n.insightsTefTitle, sectionId: "tef") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsFoodDays7)
            } else {
                InsightHeadline(
                    value: L10n.insightsKcalPerDay(Int(result.avgTEF.rounded())),
                    caption: L10n.insightsTefPct(Int(result.avgTEFPct.rounded())),
                    tint: MacroColors.calories
                )
                InsightFootnote(text: L10n.insightsTefExplanation)
            }
        }
    }
}

struct ProteinDistributionCard: View {
    let result: ProteinDistributionResult

    private var scoreTint: Color {
        switch result.score {
        case 70...: MacroColors.fiber
        case 40...: MacroColors.carbs
        default: MacroColors.protein
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsProteinDistributionTitle, sectionId: "protein_dist") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsFoodDays7)
            } else {
                InsightHeadline(
                    value: "\(result.score.rounded0)/100",
                    caption: L10n.insightsDistributionScore,
                    tint: scoreTint
                )
                HStack(alignment: .top) {
                    InsightStat(
                        value: "\(result.avgPerMeal.rounded1) g",
                        caption: L10n.insightsAvgPerMeal,
                        tint: MacroColors.protein
                    )
                    InsightStat(
                        value: "\(result.mealsBelowThreshold) / \(result.totalMeals)",
                        caption: L10n.insightsMealsBelowThreshold,
                        tint: MacroColors.carbs
                    )
                }
            }
        }
    }
}

struct CalorieFrontLoadingCard: View {
    let result: FrontLoadingResult

    var body: some View {
        InsightCardView(title: L10n.insightsFrontLoadingTitle, sectionId: "calorie_front") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsTimedFoodDays7)
            } else {
                InsightHeadline(
                    value: "\(result.avgMorningPct.rounded0)%",
                    caption: L10n.insightsFrontLoadingBefore2pm,
                    tint: MacroColors.calories
                )
                InsightFootnote(
                    text: L10n.insightsFrontLoadingDays(Int(result.daysAbove50Pct), Int(result.totalDays))
                )
            }
        }
    }
}

struct CalorieCyclingCard: View {
    let result: CalorieCyclingResult

    private var patternTint: Color {
        switch result.pattern {
        case "consistent": MacroColors.fiber
        case "moderate", "moderate_cycling": MacroColors.calories
        default: MacroColors.carbs
        }
    }

    private var patternLabel: String {
        switch result.pattern {
        case "consistent": L10n.insightsCyclingConsistent
        case "moderate", "moderate_cycling": L10n.insightsCyclingModerate
        case "high_cycling": L10n.insightsCyclingHigh
        default: result.pattern.replacingOccurrences(of: "_", with: " ").capitalizedFirst
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsCalorieCyclingTitle, sectionId: "calorie_cycle") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsFoodDays7)
            } else {
                Text(patternLabel)
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .foregroundStyle(patternTint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(alignment: .top) {
                    InsightStat(
                        value: L10n.formatKcal("\(result.mean.rounded0)"),
                        caption: L10n.insightsAvgDaily,
                        tint: MacroColors.calories
                    )
                    InsightStat(
                        value: "±" + L10n.formatKcal("\(result.stddev.rounded0)"),
                        caption: L10n.insightsStdDeviation,
                        tint: .primary
                    )
                }
                HStack {
                    Text(L10n.insightsHighDays(Int(result.highDays)))
                    Spacer()
                    Text(L10n.insightsLowDays(Int(result.lowDays)))
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
        }
    }
}

struct WeekdayWeekendCard: View {
    let result: WeekdayWeekendResult

    var body: some View {
        InsightCardView(title: L10n.insightsWeekdayWeekendTitle, sectionId: "weekday_weekend") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsWeekdayWeekend)
            } else {
                HStack(alignment: .top, spacing: 16) {
                    dayColumn(L10n.insightsWeekday, result.weekday)
                    dayColumn(L10n.insightsWeekend, result.weekend)
                }
                let sign = result.calorieDelta > 0 ? "+" : ""
                InsightFootnote(
                    text: L10n.insightsWeekendDelta(
                        sign,
                        "\(result.calorieDelta.rounded0)",
                        sign,
                        "\(result.calorieDeltaPct.rounded0)"
                    )
                )
            }
        }
    }

    private func dayColumn(_ label: String, _ stats: DayStats) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.subheadline.weight(.semibold))
            macroStat(stats.avgCalories, unit: L10n.insightsKcalUnit, tint: MacroColors.calories)
            macroStat(stats.avgProtein, unit: L10n.insightsGProtein, tint: MacroColors.protein)
            macroStat(stats.avgCarbs, unit: L10n.insightsGCarbs, tint: MacroColors.carbs)
            macroStat(stats.avgFat, unit: L10n.insightsGFat, tint: MacroColors.fat)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func macroStat(_ value: Double, unit: String, tint: Color) -> some View {
        HStack(spacing: 4) {
            Text("\(value.rounded0)")
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(unit)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct MealRegularityCard: View {
    let result: MealRegularityResult

    private var scoreTint: Color {
        switch result.overallScore {
        case 70...: MacroColors.fiber
        case 40...: MacroColors.carbs
        default: MacroColors.protein
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsMealRegularityTitle, sectionId: "meal_regularity") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsTimedFoodDays7)
            } else {
                InsightHeadline(
                    value: "\(result.overallScore.rounded0)/100",
                    caption: L10n.insightsOverallRegularityScore,
                    tint: scoreTint
                )
                ForEach(result.meals, id: \.mealType) { meal in
                    InsightRow(
                        label: meal.mealType.capitalizedFirst,
                        value: regularityLabel(meal.regularity),
                        tint: regularityTint(meal.regularity)
                    )
                }
            }
        }
    }

    private func regularityLabel(_ regularity: String) -> String {
        switch regularity {
        case "high": L10n.insightsRegularityHigh
        case "medium": L10n.insightsRegularityMedium
        case "low": L10n.insightsRegularityLow
        default: regularity.capitalizedFirst
        }
    }

    private func regularityTint(_ regularity: String) -> Color {
        switch regularity {
        case "high": MacroColors.fiber
        case "medium": MacroColors.carbs
        default: MacroColors.protein
        }
    }
}

struct FoodDiversityCard: View {
    let result: FoodDiversityResult

    private var trendLabel: String {
        switch result.trend {
        case "increasing": L10n.insightsDiversityIncreasing
        case "stable": L10n.insightsDiversityStable
        case "decreasing": L10n.insightsDiversityDecreasing
        default: result.trend.capitalizedFirst
        }
    }

    private var trendTint: Color {
        switch result.trend {
        case "increasing": MacroColors.fiber
        case "stable": MacroColors.calories
        default: MacroColors.carbs
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsFoodDiversityTitle, sectionId: "food_diversity") {
            if result.confidence == .insufficient {
                InsightEmptyState(message: L10n.insightsNeedsFoodWeeks7)
            } else {
                HStack(alignment: .top) {
                    InsightHeadline(
                        value: "\(result.avgUniquePerWeek.rounded0)",
                        caption: L10n.insightsUniqueFoodsPerWeek,
                        tint: MacroColors.calories
                    )
                    Text(trendLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(trendTint)
                }
                InsightFootnote(text: L10n.insightsDiversityBasedOn(Int(result.sampleSize)))
            }
        }
    }
}
