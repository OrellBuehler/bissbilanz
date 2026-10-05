package com.bissbilanz.fixtures

import com.bissbilanz.analytics.GoalMacro
import com.bissbilanz.analytics.GoalRule
import com.bissbilanz.analytics.adjustGoalsForActivity
import com.bissbilanz.analytics.classifyGoalOutcome
import com.bissbilanz.analytics.summarizeGoalAdherence
import com.bissbilanz.api.generated.model.DailyStat
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.api.generated.model.MacroSummary
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.label.NutritionLabelParser
import com.bissbilanz.util.RecipeScaleMode
import com.bissbilanz.util.caloriesPerHundredGrams
import com.bissbilanz.util.computeRecipePerServingMacros
import com.bissbilanz.util.convertQuantityForMacros
import com.bissbilanz.util.cookedWeightServingSize
import com.bissbilanz.util.gramsToServings
import com.bissbilanz.util.mealForCurrentTime
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.recipeScaleFactor
import com.bissbilanz.util.scaleIngredients
import com.bissbilanz.util.serverTotalsToPerServing
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.test.Test

/**
 * Asserts tests/fixtures/shared/{goal-rules,recipe-math,label-parsing}.json and the
 * generated-*.json grids (scripts/shared-fixtures) against the shared Kotlin
 * implementation. The web and iOS suites assert the same files.
 */
class SharedFixturesTest {
    @Test
    fun goalRules() = runFixture("goal-rules.json", ::runGoalRules)

    @Test
    fun recipeMath() = runFixture("recipe-math.json", ::runRecipeMath)

    @Test
    fun labelParsing() = runFixture("label-parsing.json", ::runLabelParsing)

    @Test
    fun generatedGoalRules() = runFixture("generated-goal-rules.json", ::runGoalRules)

    @Test
    fun generatedRecipeMath() = runFixture("generated-recipe-math.json", ::runRecipeMath)

    @Test
    fun generatedUnitConversion() = runFixture("generated-unit-conversion.json", ::runRecipeMath)

    @Test
    fun generatedMealTypes() = runFixture("generated-meal-types.json", ::runMealTypes)

    private fun runMealTypes(case: FixtureCase): JsonElement {
        val i = case.input
        return when (case.fn) {
            "normalizeMealType" -> JsonPrimitive(normalizeMealType(i.string("value")))
            "mealForHour" -> JsonPrimitive(mealForCurrentTime(i.getValue("hour").jsonPrimitive.int))
            else -> error("no Kotlin harness for fn ${case.fn}")
        }
    }

    private fun runGoalRules(case: FixtureCase): JsonElement {
        val i = case.input
        return when (case.fn) {
            "classifyGoalOutcome" -> {
                val rule = GoalRule.entries.first { it.wire == i.string("rule") }
                classifyGoalOutcome(rule, i.double("value"), i.double("goal"))?.wire.json()
            }

            "adjustGoalsForActivity" -> {
                val goals = fixtureJson.decodeFromJsonElement<Goals>(i.getValue("goals"))
                val result =
                    adjustGoalsForActivity(
                        goals,
                        i.getValue("activityCalories").jsonPrimitive.intOrNull,
                        i.getValue("enabled").jsonPrimitive.booleanOrNull!!,
                        i.getValue("creditPercent").jsonPrimitive.intOrNull!!,
                    )!!
                buildJsonObject {
                    put("activityBonus", result.activityBonus)
                    put(
                        "goals",
                        buildJsonObject {
                            put("calorieGoal", result.goals.calorieGoal)
                            put("proteinGoal", result.goals.proteinGoal)
                            put("carbGoal", result.goals.carbGoal)
                            put("fatGoal", result.goals.fatGoal)
                            put("fiberGoal", result.goals.fiberGoal)
                            put("sodiumGoal", result.goals.sodiumGoal)
                            put("sugarGoal", result.goals.sugarGoal)
                        },
                    )
                }
            }

            "summarizeGoalAdherence" -> {
                val days = i.getValue("days").jsonArray.map { fixtureJson.decodeFromJsonElement<DailyStat>(it) }
                val goals = fixtureJson.decodeFromJsonElement<Goals>(i.getValue("goals"))
                val activity = i.getValue("activity").jsonObject
                val summary =
                    summarizeGoalAdherence(
                        days,
                        goals,
                        activity.getValue("enabled").jsonPrimitive.booleanOrNull!!,
                        activity.getValue("creditPercent").jsonPrimitive.intOrNull!!,
                    )
                buildJsonArray {
                    for (row in summary) {
                        add(
                            buildJsonObject {
                                put("key", row.macro.key())
                                put("below", row.below)
                                put("met", row.met)
                                put("above", row.above)
                                put("eligible", row.eligible)
                            },
                        )
                    }
                }
            }

            else -> error("no Kotlin harness for fn ${case.fn}")
        }
    }

    private fun GoalMacro.key(): String = name.lowercase()

    private fun runRecipeMath(case: FixtureCase): JsonElement {
        val i = case.input
        return when (case.fn) {
            "convertQuantityForMacros" ->
                JsonPrimitive(convertQuantityForMacros(i.double("quantity"), i.string("from"), i.string("to")))

            "recipeMacros" -> {
                val ingredients = i.getValue("ingredients").jsonArray.map { it.jsonObject }
                val foods =
                    ingredients
                        .mapIndexed {
                            index,
                            ing,
                            ->
                            "f$index" to fixtureJson.decodeFromJsonElement<Food>(foodJson("f$index", ing))
                        }.toMap()
                val recipeIngredients =
                    ingredients.mapIndexed { index, ing ->
                        fixtureJson.decodeFromJsonElement<RecipeIngredient>(
                            buildJsonObject {
                                put("foodId", "f$index")
                                put("quantity", ing.double("quantity"))
                                put("servingUnit", ing.string("servingUnit"))
                                put("sortOrder", index)
                            },
                        )
                    }
                val totalServings = i.double("totalServings")
                val perServing = computeRecipePerServingMacros(recipeIngredients, totalServings) { foods[it] } ?: return JsonNull
                // Kotlin only aggregates per serving, so `total` is derived here; it is really asserted on web and iOS.
                buildJsonObject {
                    put("perServing", perServing.json())
                    put(
                        "total",
                        MacroSummary(
                            perServing.calories * totalServings,
                            perServing.protein * totalServings,
                            perServing.carbs * totalServings,
                            perServing.fat * totalServings,
                            perServing.fiber * totalServings,
                        ).json(),
                    )
                }
            }

            "cookedWeightServingSize" -> cookedWeightServingSize(i.doubleOrNull("cookedWeight"), i.double("totalServings")).json()

            "gramsToServings" -> gramsToServings(i.double("grams"), i.doubleOrNull("cookedWeight"), i.double("totalServings")).json()

            "caloriesPerHundredGrams" -> {
                val totalServings = i.double("totalServings")
                caloriesPerHundredGrams(i.double("calories") / totalServings, i.doubleOrNull("cookedWeight"), totalServings).json()
            }

            "recipeScaleFactor" ->
                recipeScaleFactor(
                    i.double("totalServings"),
                    i.doubleOrNull("cookedWeight"),
                    i.double("amount"),
                    if (i.string("mode") == "grams") RecipeScaleMode.Grams else RecipeScaleMode.Servings,
                ).json()

            "scaleIngredients" -> {
                val ingredients =
                    i.getValue("ingredients").jsonArray.mapIndexed { index, element ->
                        fixtureJson.decodeFromJsonElement<RecipeIngredient>(
                            buildJsonObject {
                                for ((key, value) in element.jsonObject) put(key, value)
                                put("sortOrder", index)
                            },
                        )
                    }
                buildJsonArray {
                    for (ing in scaleIngredients(ingredients, i.double("factor"))) {
                        add(
                            buildJsonObject {
                                put("foodId", ing.foodId)
                                put("quantity", ing.quantity)
                                put("servingUnit", ing.servingUnit.value)
                            },
                        )
                    }
                }
            }

            "wholeToPerServing" -> {
                val macros = i.getValue("macros").jsonObject
                val recipe =
                    fixtureJson.decodeFromJsonElement<RecipeDetail>(
                        buildJsonObject {
                            put("id", "r")
                            put("userId", "u")
                            put("name", "Recipe")
                            put("totalServings", i.double("totalServings"))
                            put("isFavorite", false)
                            put("imageUrl", JsonNull)
                            for (key in MACROS) put(key, macros.double(key))
                            put("ingredients", buildJsonArray { })
                        },
                    )
                val perServing = recipe.serverTotalsToPerServing()
                MacroSummary(perServing.calories, perServing.protein, perServing.carbs, perServing.fat, perServing.fiber).json()
            }

            else -> error("no Kotlin harness for fn ${case.fn}")
        }
    }

    private fun runLabelParsing(case: FixtureCase): JsonElement {
        val i = case.input
        return when (case.fn) {
            "parseRows" -> {
                val parsed = NutritionLabelParser.parse(i.strings("rows"))
                buildJsonObject {
                    put("calories", parsed.calories)
                    put("protein", parsed.protein)
                    put("carbs", parsed.carbs)
                    put("fat", parsed.fat)
                    put("fiber", parsed.fiber)
                    put("sugar", parsed.sugar)
                    put("saturatedFat", parsed.saturatedFat)
                    put("salt", parsed.salt)
                    put("sodium", parsed.sodium)
                    put("isVolume", parsed.isVolume)
                }
            }

            "isVolumeBasis" -> JsonPrimitive(NutritionLabelParser.isVolumeBasis(i.strings("rows")))

            "parseDecimal" ->
                NutritionLabelParser
                    .parseDecimal(i.string("token"), i.getValue("energyKJ").jsonPrimitive.booleanOrNull!!)
                    .json()

            else -> error("no Kotlin harness for fn ${case.fn}")
        }
    }

    private fun foodJson(
        id: String,
        ingredient: JsonObject,
    ): JsonObject {
        val food = ingredient.getValue("food").jsonObject
        return buildJsonObject {
            put("id", id)
            put("userId", "u")
            put("name", "Food $id")
            put("brand", JsonNull)
            put("servingSize", food.double("servingSize"))
            put("servingUnit", food.string("servingUnit"))
            for (key in MACROS) put(key, food.double(key))
            put("barcode", JsonNull)
            put("nutriScore", JsonNull)
            put("novaGroup", JsonNull)
            put("additives", JsonNull)
            put("ingredientsText", JsonNull)
            put("imageUrl", JsonNull)
            put("isFavorite", false)
        }
    }

    private fun MacroSummary.json(): JsonObject =
        buildJsonObject {
            put("calories", calories)
            put("protein", protein)
            put("carbs", carbs)
            put("fat", fat)
            put("fiber", fiber)
        }

    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content

    private fun JsonObject.double(key: String): Double = getValue(key).jsonPrimitive.doubleOrNull!!

    private fun JsonObject.doubleOrNull(key: String): Double? = getValue(key).jsonPrimitive.doubleOrNull

    private fun JsonObject.strings(key: String): List<String> = getValue(key).jsonArray.map { it.jsonPrimitive.content }

    private fun String?.json(): JsonElement = if (this == null) JsonNull else JsonPrimitive(this)

    private fun Double?.json(): JsonElement = if (this == null) JsonNull else JsonPrimitive(this)

    private companion object {
        val MACROS = listOf("calories", "protein", "carbs", "fat", "fiber")
    }
}
