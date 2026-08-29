import Foundation
import shared
import SwiftData

/// Builds the insights screen's data from the local SwiftData store using the
/// shared Kotlin analytics (`InsightsComputerKt.computeInsights`) — the same
/// function Android calls, so both apps render the same numbers by construction.
///
/// Everything here is the platform half that `Aggregation.kt` describes: mapping
/// local rows into the plain `AggEntry` / `AggFood` / `AggRecipe` shapes. The
/// maths, the SQL-faithful NULL handling and every threshold live in the shared
/// module and are locked to the server by the golden-vector parity suite.
///
/// Runs on the main actor, synchronously, like `LocalMaintenance`: the work is a
/// few hundred entries of pure arithmetic, and keeping it here avoids handing
/// non-`Sendable` Kotlin objects across an isolation boundary. If a much larger
/// window ever makes this janky, the fix is to map the bundle into Swift value
/// types and move the computation off the actor — not to bounce Kotlin objects.
@MainActor
enum LocalInsights {
    /// Computes every insights card for the range, or nil if the store is empty.
    ///
    /// `timeZoneId` drives the time-of-day analytics (meal timing, regularity,
    /// calorie front-loading, the caffeine cutoff), which bucket a stored UTC
    /// instant into the user's local hours.
    static func compute(
        context: ModelContext,
        startDate: String,
        endDate: String,
        timeZoneId: String = TimeZone.current.identifier
    ) -> InsightsBundle? {
        let entryDescriptor = FetchDescriptor<LocalEntry>(
            predicate: #Predicate { $0.date >= startDate && $0.date <= endDate }
        )
        let entryRows = (try? context.fetch(entryDescriptor)) ?? []
        guard !entryRows.isEmpty else { return nil }

        let weightDescriptor = FetchDescriptor<LocalWeightEntry>(
            predicate: #Predicate { $0.entryDate >= startDate && $0.entryDate <= endDate },
            sortBy: [SortDescriptor(\.entryDate)]
        )
        // One day past the range on purpose: the caffeine cutoff pairs a day's
        // last coffee with the *following* night, so the night after the last day
        // in range still belongs to this window (matches LocalAnalytics.insights).
        let sleepEnd = DateFormatting.date(from: endDate)
            .map { DateFormatting.isoString(from: $0.adding(days: 1)) } ?? endDate
        let sleepDescriptor = FetchDescriptor<LocalSleepEntry>(
            predicate: #Predicate { $0.entryDate >= startDate && $0.entryDate <= sleepEnd },
            sortBy: [SortDescriptor(\.entryDate)]
        )

        let entries = entryRows.compactMap { row in row.toEntry().map { aggEntry($0, date: row.date) } }
        let recipes = recipeInputs(context: context)

        return InsightsComputerKt.computeInsights(
            input: InsightsInput(
                entries: entries,
                foods: foodInputs(context: context),
                recipes: recipes,
                weights: ((try? context.fetch(weightDescriptor)) ?? [])
                    .map { WeightRow(entryDate: $0.entryDate, weightKg: $0.weightKg) },
                sleep: ((try? context.fetch(sleepDescriptor)) ?? []).compactMap { row in
                    // Decoded rather than read off the typed column: the cache
                    // stores quality as an Int, and the caffeine cutoff wants the
                    // Double the server sent.
                    row.toSleepEntry().map {
                        InsightsSleepRow(
                            entryDate: $0.entryDate,
                            durationMinutes: Int32($0.durationMinutes),
                            quality: $0.quality
                        )
                    }
                },
                timeZoneId: timeZoneId
                // eveningCutoffHour / lateMealCutoffHour keep their shared defaults.
            )
        )
    }

    // MARK: - Row mapping

    /// `Entry`'s macros are already resolved per serving server-side, but the
    /// extended nutrients are not — those come from the food/recipe tables below,
    /// which is why the quick* values are the only macros carried here.
    private static func aggEntry(_ entry: Entry, date: String) -> AggEntry {
        AggEntry(
            date: date,
            mealType: entry.mealType,
            servings: entry.servings,
            foodId: entry.foodId,
            recipeId: entry.recipeId,
            eatenAt: entry.eatenAt,
            foodName: entry.foodName,
            quickName: entry.quickName,
            quickCalories: entry.quickCalories.map { KotlinDouble(double: $0) },
            quickProtein: entry.quickProtein.map { KotlinDouble(double: $0) },
            quickCarbs: entry.quickCarbs.map { KotlinDouble(double: $0) },
            quickFat: entry.quickFat.map { KotlinDouble(double: $0) },
            quickFiber: entry.quickFiber.map { KotlinDouble(double: $0) }
        )
    }

    /// Every cached food, plus any food embedded in a recipe's ingredients — the
    /// latter covers an ingredient whose food was never separately cached.
    /// Mirrors Android's `LocalAnalytics.loadFoods`.
    private static func foodInputs(context: ModelContext) -> [AggFood] {
        var byId: [String: AggFood] = [:]
        for row in (try? context.fetch(FetchDescriptor<LocalFood>())) ?? [] {
            if let food = row.toFood() { byId[food.id] = aggFood(food) }
        }
        for row in (try? context.fetch(FetchDescriptor<LocalRecipe>())) ?? [] {
            for ingredient in row.toRecipe()?.ingredients ?? [] {
                if let food = ingredient.food, byId[food.id] == nil { byId[food.id] = aggFood(food) }
            }
        }
        return Array(byId.values)
    }

    private static func recipeInputs(context: ModelContext) -> [AggRecipe] {
        ((try? context.fetch(FetchDescriptor<LocalRecipe>())) ?? []).compactMap { row in
            guard let recipe = row.toRecipe() else { return nil }
            return AggRecipe(
                id: recipe.id,
                totalServings: recipe.totalServings,
                ingredients: (recipe.ingredients ?? []).map {
                    AggRecipeIngredient(foodId: $0.foodId, quantity: $0.quantity)
                }
            )
        }
    }

    private static func aggFood(_ food: Food) -> AggFood {
        AggFood(
            id: food.id,
            servingSize: food.servingSize,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            novaGroup: food.novaGroup.map { KotlinInt(int: Int32($0)) },
            omega3: food.omega3.map { KotlinDouble(double: $0) },
            omega6: food.omega6.map { KotlinDouble(double: $0) },
            sodium: food.sodium.map { KotlinDouble(double: $0) },
            caffeine: food.caffeine.map { KotlinDouble(double: $0) },
            saturatedFat: food.saturatedFat.map { KotlinDouble(double: $0) },
            transFat: food.transFat.map { KotlinDouble(double: $0) },
            vitaminC: food.vitaminC.map { KotlinDouble(double: $0) },
            vitaminD: food.vitaminD.map { KotlinDouble(double: $0) },
            vitaminE: food.vitaminE.map { KotlinDouble(double: $0) },
            alcohol: food.alcohol.map { KotlinDouble(double: $0) },
            addedSugars: food.addedSugars.map { KotlinDouble(double: $0) }
        )
    }
}
