package com.bissbilanz.repository

import com.bissbilanz.analytics.AggEntry
import com.bissbilanz.analytics.AggFood
import com.bissbilanz.analytics.AggRecipe
import com.bissbilanz.analytics.AggRecipeIngredient
import com.bissbilanz.analytics.MaintenanceInput
import com.bissbilanz.analytics.SleepRow
import com.bissbilanz.analytics.WeightRow
import com.bissbilanz.analytics.aggregateDailyNutrientTotals
import com.bissbilanz.analytics.calculateMaintenance
import com.bissbilanz.analytics.extendedNutrientEntries
import com.bissbilanz.analytics.foodDiversityRows
import com.bissbilanz.analytics.localMinutesOfDay
import com.bissbilanz.analytics.mealTimingRows
import com.bissbilanz.analytics.sleepFoodCorrelation
import com.bissbilanz.analytics.weightFoodSeries
import com.bissbilanz.api.generated.model.DailyNutrients
import com.bissbilanz.api.generated.model.DailyWeightFood
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodDiversityEntry
import com.bissbilanz.api.generated.model.FoodDiversityResponse
import com.bissbilanz.api.generated.model.MaintenanceMeta
import com.bissbilanz.api.generated.model.MaintenanceResponse
import com.bissbilanz.api.generated.model.MealTimingEntry
import com.bissbilanz.api.generated.model.MealTimingResponse
import com.bissbilanz.api.generated.model.NutrientsDailyResponse
import com.bissbilanz.api.generated.model.NutrientsExtendedResponse
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.SleepFoodCorrelationEntry
import com.bissbilanz.api.generated.model.SleepFoodCorrelationResponse
import com.bissbilanz.api.generated.model.WeightFoodResponse
import com.bissbilanz.model.Entry
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.totalMacros
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.serialization.json.Json
import com.bissbilanz.api.generated.model.ExtendedNutrientEntry as ExtendedNutrientDto
import com.bissbilanz.api.generated.model.MaintenanceResult as MaintenanceResultDto

/**
 * Computes the analytics + maintenance responses on-device from the local
 * SQLDelight cache, so the mobile apps no longer need the server's analytics
 * endpoints for these screens (local/anonymous users get them with no network;
 * online users compute from the synced local DB).
 *
 * It produces the very same generated response DTOs the API returned, so the
 * view models that consume them are unchanged. The heavy lifting — resolving
 * food / recipe / quick-add entries into per-day and per-entry nutrients — is
 * done by the shared, golden-vector-locked aggregation in
 * [com.bissbilanz.analytics]; this class is only the platform data-loader that
 * maps cached rows into that aggregation's plain input shapes.
 *
 * The cached [Entry] embeds its [Food] (with extended nutrients) and
 * [RecipeDetail] (with ingredients); recipe-ingredient foods are resolved
 * against the full cached food table, matching the server's CTE join.
 */
class LocalAnalytics(
    private val db: UserDataDatabase,
    private val json: Json,
) {
    fun nutrientsDaily(
        startDate: String,
        endDate: String,
    ): NutrientsDailyResponse {
        val inputs = buildInputs(loadEntries(startDate, endDate))
        val totals = aggregateDailyNutrientTotals(inputs.entries, inputs.foods, inputs.recipes)
        return NutrientsDailyResponse(
            data =
                totals.map {
                    DailyNutrients(
                        date = it.date,
                        calories = it.calories,
                        protein = it.protein,
                        carbs = it.carbs,
                        fat = it.fat,
                        fiber = it.fiber,
                    )
                },
        )
    }

    fun nutrientsExtended(
        startDate: String,
        endDate: String,
    ): NutrientsExtendedResponse {
        val inputs = buildInputs(loadEntries(startDate, endDate))
        val rows = extendedNutrientEntries(inputs.entries, inputs.foods, inputs.recipes)
        return NutrientsExtendedResponse(
            data =
                rows.map { r ->
                    ExtendedNutrientDto(
                        date = r.date,
                        mealType = r.mealType,
                        eatenAt = r.eatenAt ?: "",
                        foodId = r.foodId,
                        recipeId = r.recipeId,
                        foodName = r.foodName,
                        calories = r.calories,
                        protein = r.protein,
                        carbs = r.carbs,
                        fat = r.fat,
                        fiber = r.fiber,
                        novaGroup = r.novaGroup,
                        omega3 = r.omega3,
                        omega6 = r.omega6,
                        sodium = r.sodium,
                        caffeine = r.caffeine,
                        saturatedFat = r.saturatedFat,
                        transFat = r.transFat,
                        vitaminC = r.vitaminC,
                        vitaminD = r.vitaminD,
                        vitaminE = r.vitaminE,
                        alcohol = r.alcohol,
                        addedSugars = r.addedSugars,
                    )
                },
        )
    }

    fun mealTiming(
        startDate: String,
        endDate: String,
    ): MealTimingResponse {
        val inputs = buildInputs(loadEntries(startDate, endDate))
        val rows = mealTimingRows(inputs.entries, inputs.foods, inputs.recipes)
        return MealTimingResponse(
            data =
                rows.map { r ->
                    MealTimingEntry(
                        date = r.date,
                        mealType = r.mealType,
                        eatenAt = r.eatenAt ?: "",
                        foodId = r.foodId,
                        recipeId = r.recipeId,
                        calories = r.calories,
                        foodName = r.foodName,
                    )
                },
        )
    }

    fun foodDiversity(
        startDate: String,
        endDate: String,
    ): FoodDiversityResponse {
        val entries = loadEntries(startDate, endDate)
        val foods = loadFoods(entries)
        val rows = foodDiversityRows(entries.map { it.toAggEntry() }, foods)
        return FoodDiversityResponse(
            data =
                rows.map { r ->
                    FoodDiversityEntry(
                        date = r.date,
                        foodId = r.foodId,
                        recipeId = r.recipeId,
                        foodName = r.foodName,
                        novaGroup = r.novaGroup,
                    )
                },
        )
    }

    fun weightFood(
        startDate: String,
        endDate: String,
    ): WeightFoodResponse {
        val inputs = buildInputs(loadEntries(startDate, endDate))
        val weights =
            db.userDataDatabaseQueries
                .selectWeightEntriesByDateRange(startDate, endDate)
                .executeAsList()
                .map { WeightRow(it.entryDate, it.weightKg) }
        val series = weightFoodSeries(inputs.entries, inputs.foods, inputs.recipes, weights)
        return WeightFoodResponse(
            data =
                series.map {
                    DailyWeightFood(
                        date = it.date,
                        calories = it.calories,
                        weightKg = it.weightKg,
                        movingAvg = it.movingAvg,
                    )
                },
        )
    }

    fun sleepFood(
        startDate: String,
        endDate: String,
    ): SleepFoodCorrelationResponse {
        // The server filters evening entries to those eaten at/after 17:00 local;
        // bucket the stored UTC instant into the device timezone to match.
        val deviceTz = TimeZone.currentSystemDefault().id
        val eveningEntries =
            loadEntries(startDate, endDate).filter { e ->
                val minutes = e.eatenAt?.let { localMinutesOfDay(it, deviceTz) } ?: return@filter false
                minutes / 60 >= EVENING_CUTOFF_HOUR
            }
        val inputs = buildInputs(eveningEntries)
        val sleep =
            db.userDataDatabaseQueries
                .selectSleepEntriesByDateRange(startDate, endDate)
                .executeAsList()
                .map { SleepRow(it.entryDate, it.durationMinutes.toInt(), it.quality.toInt()) }
        val rows = sleepFoodCorrelation(inputs.entries, inputs.foods, inputs.recipes, sleep)
        return SleepFoodCorrelationResponse(
            data =
                rows.map {
                    SleepFoodCorrelationEntry(
                        date = it.date,
                        eveningCalories = it.eveningCalories,
                        sleepDurationMinutes = it.sleepDurationMinutes,
                        sleepQuality = it.sleepQuality,
                    )
                },
        )
    }

    /**
     * Computes maintenance calories for the range, mirroring the server's
     * `/api/maintenance` route (daily calories incl. fasting days as 0, averaged
     * over the whole window; weight change from first/last weight). Returns null
     * when there are fewer than two weight entries or no logged days.
     */
    fun maintenance(
        startDate: String,
        endDate: String,
        muscleRatio: Double,
    ): MaintenanceResponse? {
        val weights =
            db.userDataDatabaseQueries
                .selectWeightEntriesByDateRange(startDate, endDate)
                .executeAsList()
        if (weights.size < 2) return null

        val dailyTotals = mutableMapOf<String, Double>()
        loadEntries(startDate, endDate).groupBy { it.date }.forEach { (date, entries) ->
            dailyTotals[date] = entries.totalMacros().calories
        }
        fastingDaysInRange(startDate, endDate).forEach { date ->
            dailyTotals.getOrPut(date) { 0.0 }
        }
        if (dailyTotals.isEmpty()) return null

        val days = LocalDate.parse(startDate).daysUntil(LocalDate.parse(endDate))
        if (days <= 0) return null

        // The food window is inclusive of both endpoints, so it covers days + 1
        // calendar days; average intake over that inclusive count. The weight-change
        // rate (passed as `days` to calculateMaintenance) stays per-interval.
        val inclusiveDays = days + 1
        val totalCalories = dailyTotals.values.sum()
        val avgDailyCalories = totalCalories / inclusiveDays
        val coverage = dailyTotals.size.toDouble() / inclusiveDays
        val firstWeight = weights.first().weightKg
        val lastWeight = weights.last().weightKg
        val weightChangeKg = lastWeight - firstWeight

        val result =
            calculateMaintenance(
                MaintenanceInput(
                    weightChangeKg = weightChangeKg,
                    avgDailyCalories = avgDailyCalories,
                    days = days,
                    muscleRatio = muscleRatio,
                ),
            ) ?: return null

        return MaintenanceResponse(
            result =
                MaintenanceResultDto(
                    maintenanceCalories = result.maintenanceCalories,
                    dailyDeficit = result.dailyDeficit,
                    totalEnergyBalance = result.totalEnergyBalance,
                    fatMassKg = result.fatMassKg,
                    muscleMassKg = result.muscleMassKg,
                    fatCalories = result.fatCalories,
                    muscleCalories = result.muscleCalories,
                    avgDailyCalories = result.avgDailyCalories,
                    weightChangeKg = result.weightChangeKg,
                    days = result.days,
                    muscleRatio = result.muscleRatio,
                ),
            meta =
                MaintenanceMeta(
                    weightEntries = weights.size,
                    foodEntryDays = dailyTotals.size,
                    totalDays = inclusiveDays,
                    coverage = coverage,
                    firstWeight = firstWeight,
                    lastWeight = lastWeight,
                    startDate = startDate,
                    endDate = endDate,
                ),
        )
    }

    // --- loading + mapping ---------------------------------------------------

    private class Inputs(
        val entries: List<AggEntry>,
        val foods: List<AggFood>,
        val recipes: List<AggRecipe>,
    )

    private fun loadEntries(
        startDate: String,
        endDate: String,
    ): List<Entry> =
        db.userDataDatabaseQueries
            .selectEntriesByDateRange(startDate, endDate)
            .executeAsList()
            .mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }

    /**
     * Builds the full food table for resolution: every cached food plus any food
     * embedded in an entry (covers a recipe ingredient or a food not separately
     * cached). Entry-embedded copies win, matching the freshest synced data.
     */
    private fun loadFoods(entries: List<Entry>): List<AggFood> {
        val byId = mutableMapOf<String, AggFood>()
        db.userDataDatabaseQueries.selectAllFoods().executeAsList().forEach { row ->
            json.decodeOrNull<Food>(row.jsonData)?.let { byId[it.id] = it.toAggFood() }
        }
        entries.forEach { e -> e.food?.let { byId[it.id] = it.toAggFood() } }
        return byId.values.toList()
    }

    private fun loadRecipes(entries: List<Entry>): List<AggRecipe> {
        val byId = mutableMapOf<String, AggRecipe>()
        db.userDataDatabaseQueries.selectAllRecipes().executeAsList().forEach { row ->
            json.decodeOrNull<RecipeDetail>(row.jsonData)?.let { byId[it.id] = it.toAggRecipe() }
        }
        entries.forEach { e -> e.recipe?.let { byId[it.id] = it.toAggRecipe() } }
        return byId.values.toList()
    }

    private fun buildInputs(entries: List<Entry>): Inputs =
        Inputs(entries.map { it.toAggEntry() }, loadFoods(entries), loadRecipes(entries))

    private fun fastingDaysInRange(
        startDate: String,
        endDate: String,
    ): List<String> =
        db.userDataDatabaseQueries
            .selectAllDayProperties()
            .executeAsList()
            .filter { it.isFastingDay == 1L && it.date in startDate..endDate }
            .map { it.date }

    private fun Entry.toAggEntry(): AggEntry =
        AggEntry(
            date = date,
            mealType = mealType,
            servings = servings,
            foodId = foodId,
            recipeId = recipeId,
            eatenAt = eatenAt,
            foodName = food?.name ?: foodName,
            quickName = quickName,
            quickCalories = quickCalories,
            quickProtein = quickProtein,
            quickCarbs = quickCarbs,
            quickFat = quickFat,
            quickFiber = quickFiber,
        )

    private fun Food.toAggFood(): AggFood =
        AggFood(
            id = id,
            servingSize = servingSize,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            novaGroup = novaGroup,
            omega3 = omega3,
            omega6 = omega6,
            sodium = sodium,
            caffeine = caffeine,
            saturatedFat = saturatedFat,
            transFat = transFat,
            vitaminC = vitaminC,
            vitaminD = vitaminD,
            vitaminE = vitaminE,
            alcohol = alcohol,
            addedSugars = addedSugars,
        )

    private fun RecipeDetail.toAggRecipe(): AggRecipe =
        AggRecipe(
            id = id,
            totalServings = totalServings,
            ingredients = ingredients.map { AggRecipeIngredient(foodId = it.foodId, quantity = it.quantity) },
        )

    private companion object {
        const val EVENING_CUTOFF_HOUR = 17
    }
}
