import shared
import SwiftUI

// The Weight tab's eight cards, mirroring `ui/components/insights/` on Android.
//
// Several results carry a second level of nullability past the confidence check —
// a TDEE estimate needs weights the calorie series may not have, a forecast needs
// a current weight — so those get their own copy rather than an em dash.

struct AdaptiveTDEECard: View {
    let result: TDEEResult

    private var trendLabel: String {
        switch result.trend {
        case "gain": L10n.insightsTrendGain
        case "loss": L10n.insightsTrendLoss
        case "maintenance": L10n.insightsTrendMaintenance
        default: result.trend.capitalizedFirst
        }
    }

    private var trendTint: Color {
        switch result.trend {
        case "gain": MacroColors.carbs
        case "loss": MacroColors.fiber
        default: MacroColors.calories
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsTdeeTitle, sectionId: "adaptive_tdee") {
            if result.confidence == .insufficient {
                InsightEmptyState()
            } else {
                if let tdee = result.estimatedTDEE?.doubleValue {
                    Text(L10n.formatKcal("\(tdee.rounded0)"))
                        .font(.system(.title, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(MacroColors.calories)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    // Enough logged days for a trend, too few weigh-ins to divide by.
                    InsightEmptyState(message: L10n.insightsTdeeInsufficientWeightData)
                }
                Text(trendLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(trendTint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                InsightRow(
                    label: L10n.insightsAvgIntake,
                    value: L10n.insightsKcalPerDay(result.avgIntake.rounded0)
                )
                InsightRow(
                    label: L10n.insightsWeeklyRate,
                    value: L10n.insightsKgPerWeek(result.weeklyRate.plusSign, result.weeklyRate.rounded2)
                )
            }
        }
    }
}

struct PlateauDetectionCard: View {
    let result: PlateauResult

    private var causeLabel: String {
        switch result.cause {
        case "intake_variance": L10n.insightsPlateauCauseIntakeVariance
        case "water_retention": L10n.insightsPlateauCauseWaterRetention
        case "adaptive_metabolism": L10n.insightsPlateauCauseAdaptiveMetabolism
        default: L10n.insightsPlateauCauseNone
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsPlateauTitle, sectionId: "plateau_detect") {
            if result.confidence == .insufficient {
                InsightEmptyState()
            } else {
                Text(result.isPlateaued ? L10n.insightsPlateauDetected : L10n.insightsPlateauNone)
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .foregroundStyle(result.isPlateaued ? MacroColors.carbs : MacroColors.fiber)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(causeLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                InsightRow(label: L10n.insightsPlateauDays, value: "\(result.plateauDays)")
                if let deficit = result.estimatedDeficit?.doubleValue {
                    InsightRow(
                        label: L10n.insightsPlateauEstDeficit,
                        value: L10n.insightsKcalPerDay(deficit.rounded0)
                    )
                }
            }
        }
    }
}

struct WeightForecastCard: View {
    let result: WeightForecast

    var body: some View {
        InsightCardView(title: L10n.insightsWeightForecastTitle, sectionId: "weight_forecast") {
            if result.confidence == .insufficient {
                InsightEmptyState()
            } else if let current = result.currentWeight?.doubleValue {
                Text(L10n.weightKgValue(current.rounded1))
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(MacroColors.calories)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(L10n.insightsKgPerWeek(result.weeklyRate.plusSign, result.weeklyRate.rounded2))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                forecastRow(L10n.insightsForecast30Days, result.day30)
                forecastRow(L10n.insightsForecast60Days, result.day60)
                forecastRow(L10n.insightsForecast90Days, result.day90)
            } else {
                InsightEmptyState(message: L10n.insightsNoRecentWeightEntries)
            }
        }
    }

    private func forecastRow(_ label: String, _ value: KotlinDouble?) -> some View {
        InsightRow(
            label: label,
            value: value.map { L10n.weightKgValue($0.doubleValue.rounded1) } ?? "—"
        )
    }
}

struct SodiumWeightCard: View {
    let result: SodiumWeightResult

    /// Weak correlations stay neutral; past 0.5 the sign is what matters — sodium
    /// tracking *up* with weight is the unwelcome direction.
    private var correlationTint: Color {
        let r = result.correlation.r
        switch abs(r) {
        case ..<0.3: return .primary
        case ..<0.5: return MacroColors.carbs
        default: return r > 0 ? MacroColors.protein : MacroColors.fiber
        }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsSodiumWeightTitle, sectionId: "sodium_weight") {
            if result.confidence == .insufficient {
                InsightEmptyState()
            } else {
                InsightHeadline(
                    value: result.correlation.r.rounded2,
                    caption: L10n.insightsSodiumCorrelationLabel,
                    tint: correlationTint
                )
                InsightRow(
                    label: L10n.insightsSodiumAvg,
                    value: L10n.insightsMgPerDay(result.avgSodium.rounded0)
                )
                InsightRow(label: L10n.insightsSodiumHighDays, value: "\(result.highSodiumDays)")
                if let delta = result.avgWeightDeltaAfterHighSodium?.doubleValue {
                    InsightFootnote(
                        text: L10n.insightsSodiumWeightDelta(delta.plusSign, delta.rounded2)
                    )
                }
            }
        }
    }
}

struct CaloricLagCard: View {
    let result: CaloricLagResult

    var body: some View {
        InsightCardView(title: L10n.insightsCaloricLagTitle, sectionId: "caloric_lag") {
            if let bestLag = result.bestLag?.intValue {
                Text(L10n.insightsCaloricLagDays(Int(bestLag)))
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(MacroColors.calories)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // Lags without enough paired days carry no correlation and are
                // left out entirely rather than shown as a blank row.
                ForEach(result.results, id: \.lag) { lagResult in
                    if let correlation = lagResult.correlation {
                        let isBest = lagResult.lag == bestLag
                        HStack {
                            Text(L10n.insightsCaloricLagDay(Int(lagResult.lag)))
                                .foregroundStyle(isBest ? .primary : .secondary)
                            Spacer()
                            Text("r = \(correlation.r.rounded2)")
                                .monospacedDigit()
                                .foregroundStyle(isBest ? MacroColors.calories : .secondary)
                        }
                        .font(.subheadline.weight(isBest ? .semibold : .regular))
                    }
                }
            } else {
                InsightEmptyState(message: L10n.insightsCaloricLagNone)
            }
        }
    }
}

struct MacroImpactCard: View {
    let correlations: [NutrientCorrelation]

    /// Strongest relationships first; anything the shared analytics marked
    /// insufficient never reaches the card.
    private var ranked: [NutrientCorrelation] {
        correlations
            .filter { $0.correlation.confidence != .insufficient }
            .sorted { abs($0.correlation.r) > abs($1.correlation.r) }
    }

    var body: some View {
        InsightCardView(title: L10n.insightsMacroImpactTitle, sectionId: "macro_impact") {
            if ranked.isEmpty {
                InsightEmptyState()
            } else {
                ForEach(ranked, id: \.nutrientKey) { item in
                    let r = item.correlation.r
                    InsightRow(
                        label: nutrientDisplayName(item.nutrientKey),
                        value: "\(r.rounded2) \(r > 0 ? "↑" : "↓") \(L10n.insightsImpactWeightSuffix)",
                        tint: impactTint(r)
                    )
                }
            }
        }
    }

    /// Strength, not direction: a weak correlation stays muted whichever way it points.
    private func impactTint(_ r: Double) -> Color {
        switch abs(r) {
        case ..<0.3: .secondary
        case ..<0.5: MacroColors.carbs
        default: MacroColors.protein
        }
    }
}

struct MealTimingWeightCard: View {
    let summary: MealTimingSummary?

    var body: some View {
        InsightCardView(title: L10n.insightsMealTimingTitle, sectionId: "meal_timing_weight") {
            if let summary {
                InsightHeadline(
                    value: L10n.insightsHourWindow((summary.avgWindowMinutes / 60).rounded0),
                    caption: L10n.insightsAvgEatingWindow,
                    tint: MacroColors.calories
                )
                InsightRow(label: L10n.insightsFirstMeal, value: summary.avgFirstMealTime)
                InsightRow(label: L10n.insightsLastMeal, value: summary.avgLastMealTime)
                InsightFootnote(text: L10n.insightsLateNightPct(summary.lateNightFrequency.rounded0))
            } else {
                InsightEmptyState()
            }
        }
    }
}

struct NutrientAdequacyCard: View {
    let items: [NutrientAdequacyItem]

    var body: some View {
        InsightCardView(title: L10n.insightsNutrientAdequacyTitle, sectionId: "nutrient_adequacy") {
            if items.isEmpty {
                InsightEmptyState()
            } else {
                ForEach(items, id: \.rda.nutrientKey) { item in
                    let tint = adequacyTint(item.ratio)
                    InsightRow(
                        label: nutrientDisplayName(item.rda.nutrientKey),
                        value: "\((item.ratio * 100).rounded0)%",
                        tint: tint
                    )
                    ProgressView(value: min(max(item.ratio, 0), 1))
                        .tint(tint)
                }
            }
        }
    }

    private func adequacyTint(_ ratio: Double) -> Color {
        switch ratio {
        case ..<0.5: MacroColors.protein
        case ..<0.8: MacroColors.carbs
        default: MacroColors.fiber
        }
    }
}
