import shared
import SwiftUI

// The Sleep tab's four cards, mirroring `ui/components/insights/` on Android.
//
// `FoodSleepResult` is the one analytics result with no confidence level and no
// sample size, so its card gates on having any food impacts at all.

struct FoodSleepCard: View {
    let result: FoodSleepResult?

    var body: some View {
        InsightCardView(title: L10n.insightsFoodSleepTitle, sectionId: "food_sleep") {
            if let result, !result.foodImpacts.isEmpty {
                InsightRow(
                    label: L10n.insightsOverallAvgQuality,
                    value: L10n.insightsQualityOutOf10(result.overallAvgQuality.rounded1),
                    tint: MacroColors.calories
                )
                ForEach(result.foodImpacts.prefix(5), id: \.foodId) { impact in
                    let better = impact.delta >= 0
                    HStack {
                        Text(impact.foodName)
                            .font(.subheadline)
                        Spacer()
                        Text(impact.delta.signedRounded1)
                            .font(.subheadline.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(better ? MacroColors.fiber : MacroColors.protein)
                        Text(
                            "· " + L10n.insightsNightsCount(
                                better ? L10n.insightsBetterSleep : L10n.insightsWorseSleep,
                                Int(impact.occurrences)
                            )
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                }
            } else {
                InsightEmptyState(message: L10n.insightsNeedsLateFoodNights)
            }
        }
    }
}

struct NutrientSleepCard: View {
    let correlations: [NutrientCorrelation]

    private var ranked: [NutrientCorrelation] {
        correlations
            .filter { $0.correlation.confidence != .insufficient }
            .sorted { abs($0.correlation.r) > abs($1.correlation.r) }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsNutrientSleepTitle, sectionId: "nutrient_sleep") {
            if ranked.isEmpty {
                InsightEmptyState(message: L10n.insightsNeedsFoodSleepDays7)
            } else {
                ForEach(ranked, id: \.nutrientKey) { item in
                    let r = item.correlation.r
                    InsightRow(
                        label: nutrientDisplayName(item.nutrientKey),
                        value: "\(r.rounded2) \(r >= 0 ? "↑" : "↓") \(L10n.insightsSleepQualitySuffix)",
                        // Direction is what matters here: more of this nutrient,
                        // better or worse sleep.
                        tint: r >= 0 ? MacroColors.fiber : MacroColors.protein
                    )
                }
            }
        }
    }
}

struct PreSleepWindowCard: View {
    let summary: MealTimingSummary?

    var body: some View {
        InsightCardView(title: L10n.insightsPreSleepWindowTitle, sectionId: "pre_sleep_window") {
            if let summary, !summary.dailyWindows.isEmpty {
                Text(L10n.insightsLastMealValue(summary.avgLastMealTime))
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .foregroundStyle(MacroColors.calories)
                    .frame(maxWidth: .infinity, alignment: .leading)
                InsightRow(label: L10n.insightsFirstMeal, value: summary.avgFirstMealTime)
                InsightRow(
                    label: L10n.insightsEatingWindow,
                    value: L10n.insightsHourWindowDecimal((summary.avgWindowMinutes / 60).rounded1)
                )
                InsightRow(
                    label: L10n.insightsLateNightEating,
                    value: L10n.insightsPctOfDays(summary.lateNightFrequency.rounded0),
                    tint: lateNightTint(summary.lateNightFrequency)
                )
            } else {
                InsightEmptyState(message: L10n.insightsNeedsTimedFoodEntries)
            }
        }
    }

    private func lateNightTint(_ pct: Double) -> Color {
        switch pct {
        case ..<20: MacroColors.fiber
        case ...40: MacroColors.carbs
        default: MacroColors.protein
        }
    }
}

struct CaffeineSleepCard: View {
    let result: CaffeineSleepResult?

    var body: some View {
        InsightCardView(title: L10n.insightsCaffeineSleepTitle, sectionId: "caffeine_sleep") {
            if let result, result.confidence != .insufficient {
                Text(
                    result.estimatedCutoffHour.map { L10n.insightsCaffeineCutoff(Int(truncating: $0)) }
                        ?? L10n.insightsCaffeineNoCutoff
                )
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(MacroColors.calories)
                .frame(maxWidth: .infinity, alignment: .leading)
                ForEach(result.hourlyImpact.prefix(8), id: \.hour) { impact in
                    InsightRow(
                        label: "\(impact.hour):00",
                        value: impact.avgQuality.rounded1,
                        tint: qualityTint(impact.avgQuality)
                    )
                }
            } else {
                InsightEmptyState(message: L10n.insightsNeedsCaffeineNights7)
            }
        }
    }

    private func qualityTint(_ quality: Double) -> Color {
        switch quality {
        case 7...: MacroColors.fiber
        case 5...: MacroColors.carbs
        default: MacroColors.protein
        }
    }
}
