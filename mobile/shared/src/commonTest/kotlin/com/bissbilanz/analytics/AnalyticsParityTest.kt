package com.bissbilanz.analytics

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.fail

/**
 * Cross-language golden-vector parity for the analytics shared with the
 * TypeScript server. Both this test and tests/analytics/parity.test.ts assert
 * the same frozen fixtures, so the server's TS analytics and the mobile apps'
 * Kotlin analytics fail CI the moment they diverge. See analytics-parity/README.md.
 *
 * Lives in `commonTest` rather than `androidUnitTest` so it runs on every target.
 * The Android app runs on the JVM but the iOS app links a Kotlin/Native binary,
 * and a JVM-only test says nothing about that one — Double formatting, the
 * timezone database behind `localMinutesOfDay`, and `Instant.parse` strictness
 * all differ by platform. The cases are embedded as generated source because
 * `commonTest` has no filesystem to read a fixture from.
 */
class AnalyticsParityTest {
    @Test
    fun matchesGoldenVectors() {
        val cases = GOLDEN_VECTOR_CASES.map { Json.parseToJsonElement(it) }
        check(cases.isNotEmpty()) { "no golden-vector cases found" }

        val failures = mutableListOf<String>()
        for (case in cases) {
            val obj = case.jsonObject
            val fn = obj.getValue("fn").jsonPrimitive.content
            val name = obj.getValue("name").jsonPrimitive.content
            val input = obj.getValue("input").jsonObject
            val expected = obj.getValue("expected")
            val actual = runCase(fn, input)
            try {
                assertClose(actual, expected, "$fn/$name")
            } catch (e: AssertionError) {
                failures += e.message ?: "$fn/$name mismatch"
            }
        }
        if (failures.isNotEmpty()) {
            fail("Kotlin analytics diverged from the golden vectors:\n" + failures.joinToString("\n"))
        }
    }

    private fun runCase(
        fn: String,
        input: JsonObject,
    ): JsonElement =
        when (fn) {
            "pearsonCorrelation" -> {
                pearsonCorrelation(
                    doubleArrayFrom(input.getValue("x")),
                    doubleArrayFrom(input.getValue("y")),
                ).toJson()
            }

            "movingAverage" -> {
                movingAverage(
                    nullableDoublesFrom(input.getValue("series")),
                    input.getValue("windowSize").jsonPrimitive.int,
                ).let { result -> JsonArray(result.map { it?.let(::JsonPrimitive) ?: JsonNull }) }
            }

            "weightMovingAverage" -> {
                weightMovingAverage(
                    input.getValue("entries").jsonArray.map { it.jsonObject }.map { o ->
                        WeightChartInput(date = o.str("date"), weightKg = o.dbl("weightKg"), loggedAt = o.optStr("loggedAt"))
                    },
                    input.optInt("windowDays") ?: 7,
                ).let { result -> JsonArray(result.map { it.toJson() }) }
            }

            "computeAdaptiveTDEE" -> {
                computeAdaptiveTDEE(
                    weightSeriesFrom(input.getValue("weightSeries")),
                    calorieSeriesFrom(input.getValue("calorieSeries")),
                    input.getValue("windowDays").jsonPrimitive.int,
                ).toJson()
            }

            "detectPlateau" -> {
                detectPlateau(
                    weightSeriesFrom(input.getValue("weightSeries")),
                    calorieSeriesFrom(input.getValue("calorieSeries")),
                    input["estimatedTDEE"].nullableDouble(),
                ).toJson()
            }

            "projectWeight" -> {
                projectWeight(
                    weightSeriesFrom(input.getValue("weightSeries")),
                    input.getValue("weeklyRate").jsonPrimitive.double,
                    input.optStr("rateConfidence")?.let { ConfidenceLevel.valueOf(it.uppercase()) },
                ).toJson()
            }

            "calculateMaintenance" -> {
                calculateMaintenance(maintenanceInputFrom(input))?.toJson() ?: JsonNull
            }

            "smoothedWeightChange" -> {
                smoothedWeightChange(
                    input.getValue("weights").jsonArray.map { it.jsonObject }.map { o ->
                        DatedWeight(weightKg = o.dbl("weightKg"), entryDate = o.optStr("entryDate"))
                    },
                    input.getValue("days").jsonPrimitive.int,
                ).let {
                    buildJsonObject {
                        put("firstWeight", it.firstWeight)
                        put("lastWeight", it.lastWeight)
                        put("weightChangeKg", it.weightChangeKg)
                    }
                }
            }

            "normalCdf" -> JsonPrimitive(normalCdf(input.dbl("z")))

            "studentTwoSidedP" -> JsonPrimitive(studentTwoSidedP(input.dbl("t"), input.dbl("df")))

            "welchTTest" -> {
                welchTTest(doubleArrayFrom(input.getValue("a")).toList(), doubleArrayFrom(input.getValue("b")).toList()).let {
                    buildJsonObject {
                        put("t", it.t)
                        put("df", it.df)
                        put("pValue", it.pValue)
                    }
                }
            }

            "benjaminiHochberg" -> {
                JsonArray(benjaminiHochberg(doubleArrayFrom(input.getValue("pValues")).toList()).map(::JsonPrimitive))
            }

            "fisherCI95" -> {
                fisherCI95(input.dbl("r"), input.getValue("n").jsonPrimitive.int).let { (lo, hi) ->
                    JsonArray(listOf(JsonPrimitive(lo), JsonPrimitive(hi)))
                }
            }

            "circularMeanMinutes" -> {
                circularMeanMinutes(doubleArrayFrom(input.getValue("values")).toList())?.let(::JsonPrimitive) ?: JsonNull
            }

            "circularStdMinutes" -> {
                JsonPrimitive(circularStdMinutes(doubleArrayFrom(input.getValue("values")).toList()))
            }

            "eatingDayOf" -> {
                eatingDayOf(input.str("isoString"), input.str("timeZone"))?.let {
                    buildJsonObject {
                        put("date", it.date)
                        put("minutes", it.minutes)
                        put("clockMinutes", it.clockMinutes)
                    }
                } ?: JsonNull
            }

            "aggregateDailyNutrientTotals" -> {
                aggregateDailyNutrientTotals(
                    aggEntriesFrom(input.getValue("entries")),
                    aggFoodsFrom(input.getValue("foods")),
                    aggRecipesFrom(input.getValue("recipes")),
                ).let { result -> JsonArray(result.map { it.toJson() }) }
            }

            "computeTEF" -> {
                computeTEF(tefInputsFrom(input.getValue("dailyNutrients"))).toJson()
            }

            "computeDIIScore" -> {
                computeDIIScore(diiInputsFrom(input.getValue("dailyNutrients"))).toJson()
            }

            "extractMealTimingPatterns" -> {
                extractMealTimingPatterns(
                    mealEntriesFrom(input.getValue("entries")),
                    input.str("timeZone"),
                ).toJson()
            }

            "computeCalorieFrontLoading" -> {
                computeCalorieFrontLoading(
                    input.getValue("entries").jsonArray.map { it.jsonObject }.map { o ->
                        Triple(o.str("date"), o.optStr("eatenAt"), o.dbl("calories"))
                    },
                    input.str("timeZone"),
                    input.optInt("cutoffHour") ?: 14,
                ).toJson()
            }

            "computeCaffeineSleepCutoff" -> {
                computeCaffeineSleepCutoff(
                    caffeineEntriesFrom(input.getValue("caffeineEntries")),
                    sleepDataFrom(input.getValue("sleepData")),
                    input.str("timeZone"),
                ).toJson()
            }

            "computeMealRegularity" -> {
                computeMealRegularity(
                    regularityEntriesFrom(input.getValue("entries")),
                    input.str("timeZone"),
                ).toJson()
            }

            "computeNOVAScore" -> {
                computeNOVAScore(
                    input.getValue("entries").jsonArray.map { it.jsonObject }.map { o ->
                        o.dbl("calories") to o.optInt("novaGroup")
                    },
                ).toJson()
            }

            "computeOmegaRatio" -> {
                computeOmegaRatio(
                    input.getValue("dailyNutrients").jsonArray.map { it.jsonObject }.map { o ->
                        OmegaDay(o.str("date"), o.dbl("omega3"), o.dbl("omega6"), o.optDouble("coverage") ?: 1.0)
                    },
                ).toJson()
            }

            "computeFoodDiversity" -> {
                computeFoodDiversity(
                    input.getValue("entries").jsonArray.map { it.jsonObject }.map { o ->
                        FoodEntry(
                            date = o.str("date"),
                            foodId = o.optStr("foodId"),
                            recipeId = o.optStr("recipeId"),
                            foodName = o.str("foodName"),
                        )
                    },
                ).toJson()
            }

            "computeCalorieCycling" -> {
                computeCalorieCycling(
                    input.getValue("dailyNutrients").jsonArray.map { it.jsonObject }.map { o ->
                        o.str("date") to o.dbl("calories")
                    },
                ).toJson()
            }

            "computeCaloricLag" -> {
                computeCaloricLag(
                    seriesFrom(input.getValue("dailyCalories"), "value"),
                    seriesFrom(input.getValue("dailyWeight"), "value"),
                    input.optInt("maxLag") ?: 7,
                ).toJson()
            }

            "computeProteinDistribution" -> {
                computeProteinDistribution(
                    input.getValue("entries").jsonArray.map { it.jsonObject }.map { o ->
                        Triple(o.str("date"), o.str("mealType"), o.dbl("protein"))
                    },
                    input.optDouble("threshold") ?: 20.0,
                ).toJson()
            }

            "computeSodiumWeightCorrelation" -> {
                computeSodiumWeightCorrelation(
                    input.getValue("dailyNutrients").jsonArray.map { it.jsonObject }.map { o ->
                        SodiumDay(o.str("date"), o.dbl("sodium"), o.optDouble("coverage") ?: 1.0)
                    },
                    weightSeriesFrom(input.getValue("weightSeries")),
                ).toJson()
            }

            "computeWeekdayWeekendSplit" -> {
                computeWeekdayWeekendSplit(
                    input.getValue("dailyNutrients").jsonArray.map { it.jsonObject }.map { o ->
                        DayEntry(
                            date = o.str("date"),
                            calories = o.dbl("calories"),
                            protein = o.dbl("protein"),
                            carbs = o.dbl("carbs"),
                            fat = o.dbl("fat"),
                            fiber = o.dbl("fiber"),
                        )
                    },
                ).toJson()
            }

            "computeNutrientOutcomeCorrelations" -> {
                computeNutrientOutcomeCorrelations(
                    input.getValue("dailyNutrients").jsonArray.map { it.jsonObject }.map { o ->
                        o.str("date") to
                            o.getValue("nutrients").jsonObject.mapValues { (_, v) -> v.asNullableDouble() }
                    },
                    input.getValue("outcomes").jsonArray.map { it.jsonObject }.map { o ->
                        o.str("date") to o.dbl("value")
                    },
                    input.optInt("lagDays") ?: 0,
                ).let { result -> JsonArray(result.map { it.toJson() }) }
            }

            "detectFoodSleepPatterns" -> {
                detectFoodSleepPatterns(
                    input.getValue("eveningFoods").jsonArray.map { it.jsonObject }.map { o ->
                        EveningFoodEntry(
                            date = o.str("date"),
                            foodId = o.str("foodId"),
                            foodName = o.str("foodName"),
                            nutrients =
                                o.getValue("nutrients").jsonObject.mapValues { (_, v) -> v.jsonPrimitive.double },
                        )
                    },
                    input.getValue("sleepData").jsonArray.map { it.jsonObject }.map { o ->
                        SleepQualityPoint(date = o.str("date"), quality = o.dbl("quality"))
                    },
                    input.optInt("minOccurrences") ?: FOOD_SLEEP_MIN_OCCURRENCES,
                ).toJson()
            }

            "getConfidenceLevel" -> {
                JsonPrimitive(getConfidenceLevel(input.getValue("sampleSize").jsonPrimitive.int).wire())
            }

            "localMinutesOfDay" -> {
                localMinutesOfDay(input.str("isoString"), input.str("timeZone"))
                    ?.let(::JsonPrimitive) ?: JsonNull
            }

            "nullDiv" -> {
                nullDiv(input.dbl("a"), input.dbl("b"))?.let(::JsonPrimitive) ?: JsonNull
            }

            "nullSum" -> {
                nullSum(nullableDoublesFrom(input.getValue("values")))?.let(::JsonPrimitive) ?: JsonNull
            }

            else -> {
                error("Unknown fn in fixtures: $fn")
            }
        }

    // --- result -> JSON (shape mirrors the TS return objects) ----------------

    private fun CorrelationResult.toJson() =
        buildJsonObject {
            put("r", r)
            put("pValue", pValue)
            put("ciLow", ciLow)
            put("ciHigh", ciHigh)
            put("sampleSize", sampleSize)
            put("confidence", confidence.wire())
            put("constantInput", constantInput)
        }

    private fun TDEEResult.toJson() =
        buildJsonObject {
            putNullableDouble("estimatedTDEE", estimatedTDEE)
            put("trend", trend)
            put("avgIntake", avgIntake)
            put("weeklyRate", weeklyRate)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun PlateauResult.toJson() =
        buildJsonObject {
            put("isPlateaued", isPlateaued)
            put("plateauDays", plateauDays)
            putNullableDouble("estimatedDeficit", estimatedDeficit)
            put("cause", cause)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun WeightForecast.toJson() =
        buildJsonObject {
            putNullableDouble("currentWeight", currentWeight)
            put("weeklyRate", weeklyRate)
            putNullableDouble("day30", day30)
            putNullableDouble("day60", day60)
            putNullableDouble("day90", day90)
            put("sampleSize", sampleSize)
            put("confidence", confidence.wire())
        }

    private fun MaintenanceResult.toJson() =
        buildJsonObject {
            put("maintenanceCalories", maintenanceCalories)
            put("dailyDeficit", dailyDeficit)
            put("totalEnergyBalance", totalEnergyBalance)
            put("fatMassKg", fatMassKg)
            put("muscleMassKg", muscleMassKg)
            put("fatCalories", fatCalories)
            put("muscleCalories", muscleCalories)
            put("avgDailyCalories", avgDailyCalories)
            put("weightChangeKg", weightChangeKg)
            put("days", days)
            put("muscleRatio", muscleRatio)
        }

    private fun DailyNutrientTotals.toJson() =
        buildJsonObject {
            put("date", date)
            put("calories", calories)
            put("protein", protein)
            put("carbs", carbs)
            put("fat", fat)
            put("fiber", fiber)
            putNullableDouble("omega3", omega3)
            putNullableDouble("omega6", omega6)
            putNullableDouble("sodium", sodium)
            putNullableDouble("caffeine", caffeine)
            putNullableDouble("saturatedFat", saturatedFat)
            putNullableDouble("transFat", transFat)
            putNullableDouble("vitaminC", vitaminC)
            putNullableDouble("vitaminD", vitaminD)
            putNullableDouble("vitaminE", vitaminE)
            putNullableDouble("alcohol", alcohol)
            putNullableDouble("addedSugars", addedSugars)
            put("omega3Coverage", omega3Coverage)
            put("omega6Coverage", omega6Coverage)
            put("sodiumCoverage", sodiumCoverage)
            put("caffeineCoverage", caffeineCoverage)
            put("saturatedFatCoverage", saturatedFatCoverage)
            put("transFatCoverage", transFatCoverage)
            put("vitaminCCoverage", vitaminCCoverage)
            put("vitaminDCoverage", vitaminDCoverage)
            put("vitaminECoverage", vitaminECoverage)
            put("alcoholCoverage", alcoholCoverage)
            put("addedSugarsCoverage", addedSugarsCoverage)
        }

    // Kotlin TEFResult uses avgTEF/avgTEFPct; the TS wire shape is avgDailyTEF/avgTEFPercent.
    private fun TEFResult.toJson() =
        buildJsonObject {
            put("avgDailyTEF", avgTEF)
            put("avgTEFPercent", avgTEFPct)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun DIIResult.toJson() =
        buildJsonObject {
            put("score", score)
            put("classification", classification)
            put("contributors", JsonArray(contributors.map { it.toJson() }))
            put("coverageFraction", coverageFraction)
            put("neutralBand", neutralBand)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun DIIContributor.toJson() =
        buildJsonObject {
            put("nutrient", nutrient)
            put("impact", impact)
        }

    private fun WeightChartPoint.toJson() =
        buildJsonObject {
            put("date", date)
            put("weightKg", weightKg)
            put("movingAvg", movingAvg)
        }

    private fun MealTimingSummary.toJson() =
        buildJsonObject {
            put("dailyWindows", JsonArray(dailyWindows.map { it.toJson() }))
            put("avgWindowMinutes", avgWindowMinutes)
            put("avgFirstMealTime", avgFirstMealTime)
            put("avgLastMealTime", avgLastMealTime)
            put("lateNightFrequency", lateNightFrequency)
            put("hourlyDistribution", JsonArray(hourlyDistribution.map(::JsonPrimitive)))
        }

    private fun DailyEatingWindow.toJson() =
        buildJsonObject {
            put("date", date)
            put("firstMealTime", firstMealTime)
            put("lastMealTime", lastMealTime)
            put("windowMinutes", windowMinutes)
            put("mealCount", mealCount)
            put("lateNightMeals", lateNightMeals)
        }

    private fun FrontLoadingResult.toJson() =
        buildJsonObject {
            put("avgMorningPct", avgMorningPct)
            put("daysAbove50Pct", daysAbove50Pct)
            put("totalDays", totalDays)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun CaffeineSleepResult.toJson() =
        buildJsonObject {
            put("estimatedCutoffHour", estimatedCutoffHour?.let(::JsonPrimitive) ?: JsonNull)
            put("defaultCutoffHour", defaultCutoffHour)
            putNullableDouble("pValue", pValue)
            put("comparisons", comparisons)
            put("hourlyImpact", JsonArray(hourlyImpact.map { it.toJson() }))
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun HourlyImpact.toJson() =
        buildJsonObject {
            put("hour", hour)
            put("avgQuality", avgQuality)
            put("avgDuration", avgDuration)
            put("count", count)
        }

    private fun MealRegularityResult.toJson() =
        buildJsonObject {
            put("meals", JsonArray(meals.map { it.toJson() }))
            put("overallScore", overallScore)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun MealRegularityEntry.toJson() =
        buildJsonObject {
            put("mealType", mealType)
            put("avgMinute", avgMinute)
            put("stddevMinutes", stddevMinutes)
            put("regularity", regularity)
        }

    // Kotlin keeps the NOVA split as a Map<Int, Double>; the TS wire shape is a
    // sorted byGroup array carrying each group's share of all logged calories.
    private fun NOVAResult.toJson() =
        buildJsonObject {
            put("ultraProcessedPct", ultraProcessedPct)
            put("unknownPct", unknownPct)
            put(
                "byGroup",
                JsonArray(
                    groupDistribution.entries.sortedBy { it.key }.map { (group, kcal) ->
                        buildJsonObject {
                            put("group", group)
                            put("kcal", kcal)
                            put("pct", if (totalKcal > 0) kcal / totalKcal * 100.0 else 0.0)
                        }
                    },
                ),
            )
            put("coveragePct", coveragePct)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun OmegaResult.toJson() =
        buildJsonObject {
            putNullableDouble("ratio", ratio)
            put("avgOmega3", avgOmega3)
            put("avgOmega6", avgOmega6)
            put("status", status)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    // Kotlin: weeklyEntries/uniqueFoods/avgUniquePerWeek. TS: weeklyData/uniqueCount/
    // avgUniqueFoodsPerWeek, plus currentWeekUnique, which Kotlin derives on demand.
    private fun FoodDiversityResult.toJson() =
        buildJsonObject {
            put("avgUniqueFoodsPerWeek", avgUniquePerWeek)
            put("currentWeekUnique", weeklyEntries.lastOrNull()?.uniqueFoods ?: 0)
            put("trend", trend)
            put(
                "weeklyData",
                JsonArray(
                    weeklyEntries.map {
                        buildJsonObject {
                            put("weekStart", it.weekStart)
                            put("uniqueCount", it.uniqueFoods)
                        }
                    },
                ),
            )
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun CalorieCyclingResult.toJson() =
        buildJsonObject {
            put("mean", mean)
            put("stddev", stddev)
            put("cv", cv)
            put("pattern", pattern)
            put("highDays", highDays)
            put("lowDays", lowDays)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun CaloricLagResult.toJson() =
        buildJsonObject {
            put("bestLag", bestLag?.let(::JsonPrimitive) ?: JsonNull)
            put("comparisons", comparisons)
            put(
                "results",
                JsonArray(
                    results.map {
                        buildJsonObject {
                            put("lag", it.lag)
                            put("correlation", it.correlation?.toJson() ?: JsonNull)
                            putNullableDouble("qValue", it.qValue)
                        }
                    },
                ),
            )
        }

    private fun ProteinDistributionResult.toJson() =
        buildJsonObject {
            put("score", score)
            put("avgPerMeal", avgPerMeal)
            put("mealsPerDay", mealsPerDay)
            put("mealsBelowThreshold", mealsBelowThreshold)
            put("totalMeals", totalMeals)
            put("threshold", threshold)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun SodiumWeightResult.toJson() =
        buildJsonObject {
            put(
                "correlation",
                buildJsonObject {
                    put("r", correlation.r)
                    putNullableDouble("pValue", correlation.pValue)
                    putNullableDouble("ciLow", correlation.ciLow)
                    putNullableDouble("ciHigh", correlation.ciHigh)
                    put("sampleSize", correlation.sampleSize)
                },
            )
            put("avgSodium", avgSodium)
            put("highSodiumDays", highSodiumDays)
            putNullableDouble("avgWeightDeltaAfterHighSodium", avgWeightDeltaAfterHighSodium)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun DayStats.toJson() =
        buildJsonObject {
            put("avgCalories", avgCalories)
            put("avgProtein", avgProtein)
            put("avgCarbs", avgCarbs)
            put("avgFat", avgFat)
            put("avgFiber", avgFiber)
            put("days", days)
        }

    private fun WeekdayWeekendResult.toJson() =
        buildJsonObject {
            put("weekday", weekday.toJson())
            put("weekend", weekend.toJson())
            put("calorieDelta", calorieDelta)
            put("calorieDeltaPct", calorieDeltaPct)
            putNullableDouble("pValue", pValue)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun NutrientCorrelation.toJson() =
        buildJsonObject {
            put("nutrientKey", nutrientKey)
            put("correlation", correlation.toJson())
            put("qValue", qValue)
            put("comparisons", comparisons)
        }

    private fun FoodSleepResult.toJson() =
        buildJsonObject {
            put(
                "foodImpacts",
                JsonArray(
                    foodImpacts.map {
                        buildJsonObject {
                            put("foodName", it.foodName)
                            put("foodId", it.foodId)
                            put("avgQualityWith", it.avgQualityWith)
                            put("avgQualityWithout", it.avgQualityWithout)
                            put("delta", it.delta)
                            put("occurrences", it.occurrences)
                            put("pValue", it.pValue)
                            put("qValue", it.qValue)
                        }
                    },
                ),
            )
            put("overallAvgQuality", overallAvgQuality)
            put("comparisons", comparisons)
        }

    // TS encodes ConfidenceLevel as a lowercase string.
    private fun ConfidenceLevel.wire() = name.lowercase()

    private fun JsonObjectBuilder.putNullableDouble(
        key: String,
        value: Double?,
    ) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }

    // --- input parsing -------------------------------------------------------

    private fun weightSeriesFrom(el: JsonElement): List<Pair<String, Double?>> = seriesFrom(el, "weightKg")

    private fun calorieSeriesFrom(el: JsonElement): List<Pair<String, Double?>> = seriesFrom(el, "calories")

    private fun seriesFrom(
        el: JsonElement,
        valueKey: String,
    ): List<Pair<String, Double?>> =
        el.jsonArray.map {
            val o = it.jsonObject
            o.getValue("date").jsonPrimitive.content to o.getValue(valueKey).asNullableDouble()
        }

    private fun nullableDoublesFrom(el: JsonElement): List<Double?> = el.jsonArray.map { it.asNullableDouble() }

    private fun maintenanceInputFrom(input: JsonObject): MaintenanceInput =
        MaintenanceInput(
            weightChangeKg = input.getValue("weightChangeKg").jsonPrimitive.double,
            avgDailyCalories = input.getValue("avgDailyCalories").jsonPrimitive.double,
            days = input.getValue("days").jsonPrimitive.int,
            muscleRatio = input.optDouble("muscleRatio") ?: DEFAULT_MUSCLE_RATIO,
        )

    private fun tefInputsFrom(el: JsonElement): List<TEFInput> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            TEFInput(
                protein = o.dbl("protein"),
                carbs = o.dbl("carbs"),
                fat = o.dbl("fat"),
                calories = o.dbl("calories"),
                alcohol = o.optDouble("alcohol"),
            )
        }

    private fun aggFoodsFrom(el: JsonElement): List<AggFood> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            AggFood(
                id = o.str("id"),
                servingSize = o.dbl("servingSize"),
                calories = o.dbl("calories"),
                protein = o.dbl("protein"),
                carbs = o.dbl("carbs"),
                fat = o.dbl("fat"),
                fiber = o.dbl("fiber"),
                novaGroup = o.optInt("novaGroup"),
                omega3 = o.optDouble("omega3"),
                omega6 = o.optDouble("omega6"),
                sodium = o.optDouble("sodium"),
                caffeine = o.optDouble("caffeine"),
                saturatedFat = o.optDouble("saturatedFat"),
                transFat = o.optDouble("transFat"),
                vitaminC = o.optDouble("vitaminC"),
                vitaminD = o.optDouble("vitaminD"),
                vitaminE = o.optDouble("vitaminE"),
                alcohol = o.optDouble("alcohol"),
                addedSugars = o.optDouble("addedSugars"),
            )
        }

    private fun aggRecipesFrom(el: JsonElement): List<AggRecipe> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            AggRecipe(
                id = o.str("id"),
                totalServings = o.dbl("totalServings"),
                ingredients =
                    o.getValue("ingredients").jsonArray.map { it.jsonObject }.map { ing ->
                        AggRecipeIngredient(foodId = ing.str("foodId"), quantity = ing.dbl("quantity"))
                    },
            )
        }

    private fun aggEntriesFrom(el: JsonElement): List<AggEntry> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            AggEntry(
                date = o.str("date"),
                mealType = o.str("mealType"),
                servings = o.dbl("servings"),
                foodId = o.optStr("foodId"),
                recipeId = o.optStr("recipeId"),
                eatenAt = o.optStr("eatenAt"),
                foodName = o.optStr("foodName"),
                quickName = o.optStr("quickName"),
                quickCalories = o.optDouble("quickCalories"),
                quickProtein = o.optDouble("quickProtein"),
                quickCarbs = o.optDouble("quickCarbs"),
                quickFat = o.optDouble("quickFat"),
                quickFiber = o.optDouble("quickFiber"),
            )
        }

    private fun diiInputsFrom(el: JsonElement): List<DIIInput> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            DIIInput(
                fiber = o.optDouble("fiber"),
                omega3 = o.optDouble("omega3"),
                vitaminC = o.optDouble("vitaminC"),
                vitaminD = o.optDouble("vitaminD"),
                vitaminE = o.optDouble("vitaminE"),
                saturatedFat = o.optDouble("saturatedFat"),
                transFat = o.optDouble("transFat"),
                alcohol = o.optDouble("alcohol"),
                caffeine = o.optDouble("caffeine"),
                coverage =
                    o["coverage"]?.let { c ->
                        if (c is JsonNull) emptyMap() else c.jsonObject.mapValues { (_, v) -> v.jsonPrimitive.double }
                    } ?: emptyMap(),
            )
        }

    private fun mealEntriesFrom(el: JsonElement): List<MealEntry> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            MealEntry(date = o.str("date"), eatenAt = o.optStr("eatenAt"), calories = o.dbl("calories"))
        }

    private fun caffeineEntriesFrom(el: JsonElement): List<CaffeineEntry> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            CaffeineEntry(date = o.str("date"), eatenAt = o.optStr("eatenAt"), caffeine = o.dbl("caffeine"))
        }

    private fun sleepDataFrom(el: JsonElement): List<SleepDataPoint> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            SleepDataPoint(
                date = o.str("date"),
                sleepQuality = o.optDouble("sleepQuality"),
                sleepDurationMinutes = o.optDouble("sleepDurationMinutes"),
            )
        }

    private fun regularityEntriesFrom(el: JsonElement): List<RegularityInputEntry> =
        el.jsonArray.map { it.jsonObject }.map { o ->
            RegularityInputEntry(date = o.str("date"), mealType = o.str("mealType"), eatenAt = o.optStr("eatenAt"))
        }

    private fun JsonObject.str(key: String): String = getValue(key).jsonPrimitive.content

    private fun JsonObject.dbl(key: String): Double = getValue(key).jsonPrimitive.double

    private fun JsonObject.optStr(key: String): String? = this[key]?.let { if (it is JsonNull) null else it.jsonPrimitive.content }

    private fun JsonObject.optDouble(key: String): Double? = this[key]?.let { if (it is JsonNull) null else it.jsonPrimitive.double }

    private fun JsonObject.optInt(key: String): Int? = this[key]?.let { if (it is JsonNull) null else it.jsonPrimitive.int }

    private fun doubleArrayFrom(el: JsonElement): DoubleArray = el.jsonArray.map { it.jsonPrimitive.double }.toDoubleArray()

    private fun JsonElement.asNullableDouble(): Double? = if (this is JsonNull) null else jsonPrimitive.double

    private fun JsonElement?.nullableDouble(): Double? = if (this == null || this is JsonNull) null else jsonPrimitive.double

    // --- comparison with the same tolerances as the TS harness ---------------

    private fun assertClose(
        actual: JsonElement,
        expected: JsonElement,
        path: String,
    ) {
        when (expected) {
            is JsonNull -> {
                if (actual !is JsonNull) fail("$path: expected null, got $actual")
            }

            is JsonArray -> {
                if (actual !is JsonArray) fail("$path: expected array, got $actual")
                if (actual.size != expected.size) fail("$path: size ${actual.size} != ${expected.size}")
                expected.forEachIndexed { i, e -> assertClose(actual[i], e, "$path[$i]") }
            }

            is JsonObject -> {
                if (actual !is JsonObject) fail("$path: expected object, got $actual")
                for ((k, e) in expected) assertClose(actual[k] ?: JsonNull, e, "$path.$k")
            }

            is JsonPrimitive -> {
                assertPrimitiveClose(actual, expected, path)
            }
        }
    }

    private fun assertPrimitiveClose(
        actual: JsonElement,
        expected: JsonPrimitive,
        path: String,
    ) {
        if (actual !is JsonPrimitive) fail("$path: expected primitive, got $actual")
        val expectedBool = if (!expected.isString) expected.booleanOrNull else null
        if (expectedBool != null) {
            if (actual.booleanOrNull != expectedBool) fail("$path: expected $expectedBool, got $actual")
            return
        }
        val expectedNum = if (!expected.isString) expected.doubleOrNull else null
        if (expectedNum != null) {
            val actualNum = actual.doubleOrNull ?: fail("$path: expected number, got $actual")
            val tol =
                if (path.endsWith("pValue")) {
                    GOLDEN_TOLERANCE_P_VALUE
                } else {
                    GOLDEN_TOLERANCE_DEFAULT * maxOf(1.0, abs(expectedNum))
                }
            if (abs(actualNum - expectedNum) > tol) {
                fail("$path: expected $expectedNum, got $actualNum (tolerance $tol)")
            }
            return
        }
        if (actual.content != expected.content) fail("$path: expected '${expected.content}', got '${actual.content}'")
    }
}
