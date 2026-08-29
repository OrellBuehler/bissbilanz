import shared
import SwiftUI

// Card order per tab, matching Android's `InsightsScreen` exactly — a section the
// user learns to scroll to should be in the same place on either phone.

struct NutritionInsightsTab: View {
    let bundle: InsightsBundle

    var body: some View {
        NOVAScoreCard(result: bundle.nova)
        OmegaRatioCard(result: bundle.omega)
        DIIScoreCard(result: bundle.dii)
        TEFCard(result: bundle.tef)
        ProteinDistributionCard(result: bundle.proteinDistribution)
        CalorieFrontLoadingCard(result: bundle.frontLoading)
        CalorieCyclingCard(result: bundle.calorieCycling)
        WeekdayWeekendCard(result: bundle.weekdayWeekend)
        MealRegularityCard(result: bundle.mealRegularity)
        FoodDiversityCard(result: bundle.foodDiversity)
    }
}

struct WeightInsightsTab: View {
    let bundle: InsightsBundle

    var body: some View {
        AdaptiveTDEECard(result: bundle.tdee)
        PlateauDetectionCard(result: bundle.plateau)
        WeightForecastCard(result: bundle.weightForecast)
        SodiumWeightCard(result: bundle.sodiumWeight)
        CaloricLagCard(result: bundle.caloricLag)
        MacroImpactCard(correlations: bundle.macroImpact)
        MealTimingWeightCard(summary: bundle.mealTiming)
        NutrientAdequacyCard(items: bundle.nutrientAdequacy)
    }
}

struct SleepInsightsTab: View {
    let bundle: InsightsBundle

    var body: some View {
        FoodSleepCard(result: bundle.foodSleep)
        NutrientSleepCard(correlations: bundle.nutrientSleep)
        PreSleepWindowCard(summary: bundle.preSleepTiming)
        CaffeineSleepCard(result: bundle.caffeineSleep)
    }
}
