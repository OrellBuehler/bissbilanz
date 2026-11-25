package com.bissbilanz.android

import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.api.generated.model.RecipeStepInput
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.model.FoodCreate
import com.bissbilanz.model.Goals
import com.bissbilanz.model.RecipeCreate
import com.bissbilanz.model.RecipeIngredientInput
import com.bissbilanz.model.ServingUnit
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.WeightRepository
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.todayIn
import org.koin.core.Koin
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.time.Clock

/**
 * Invented demo data for the store screenshots, the Android twin of the iOS
 * `StoreScreenshotSeed.swift`: same foods, same three day plans, same recipes and the
 * same weight and sleep series, so both stores tell the same story. Written through the
 * repositories in Local mode, so the app reads it back exactly like a diary of its own.
 * The numbers vary by day through a fixed formula rather than a random generator, so two
 * runs produce the same pictures. Only [StoreScreenshots] calls this, and only in a
 * debug build.
 */
internal object StoreScreenshotSeed {
    class Ids(
        val salmonFoodId: String,
        val oatsRecipeId: String,
        val bowlRecipeId: String,
    )

    private class DemoFood(
        val key: String,
        val en: String,
        val de: String,
        val brand: String?,
        val size: Double,
        val unit: ServingUnit,
        val calories: Double,
        val protein: Double,
        val carbs: Double,
        val fat: Double,
        val fiber: Double,
        val favorite: Boolean,
    )

    private class Portion(
        val meal: String,
        val hour: Int,
        val food: String,
        val servings: Double,
    )

    private fun food(
        key: String,
        en: String,
        de: String,
        brand: String?,
        size: Double,
        unit: ServingUnit,
        macros: List<Double>,
        favorite: Boolean,
    ) = DemoFood(key, en, de, brand, size, unit, macros[0], macros[1], macros[2], macros[3], macros[4], favorite)

    private val foods =
        listOf(
            food("oats", "Rolled oats", "Haferflocken", null, 50.0, ServingUnit.g, listOf(187.0, 6.8, 29.5, 3.5, 5.0), true),
            food(
                "yogurt",
                "Greek yogurt",
                "Griechischer Joghurt",
                "Alpenhof",
                150.0,
                ServingUnit.g,
                listOf(146.0, 13.5, 6.0, 7.5, 0.0),
                true,
            ),
            food("blueberries", "Blueberries", "Heidelbeeren", null, 100.0, ServingUnit.g, listOf(57.0, 0.7, 12.0, 0.3, 2.4), false),
            food(
                "shake",
                "Whey protein shake",
                "Whey-Proteinshake",
                "Nordpeak",
                30.0,
                ServingUnit.g,
                listOf(114.0, 24.0, 1.8, 1.2, 0.3),
                true,
            ),
            food("chicken", "Chicken breast", "Pouletbrust", null, 150.0, ServingUnit.g, listOf(165.0, 34.5, 0.0, 2.7, 0.0), true),
            food("rice", "Basmati rice", "Basmatireis", null, 75.0, ServingUnit.g, listOf(263.0, 6.0, 58.0, 0.5, 1.0), false),
            food("broccoli", "Broccoli", "Brokkoli", null, 150.0, ServingUnit.g, listOf(51.0, 4.2, 6.0, 0.6, 3.9), false),
            food("oil", "Olive oil", "Olivenöl", null, 10.0, ServingUnit.ml, listOf(82.0, 0.0, 0.0, 9.2, 0.0), false),
            food("banana", "Banana", "Banane", null, 120.0, ServingUnit.g, listOf(107.0, 1.3, 24.4, 0.4, 3.1), true),
            food("almonds", "Almonds", "Mandeln", null, 30.0, ServingUnit.g, listOf(174.0, 6.3, 2.0, 15.0, 3.6), false),
            food("salmon", "Salmon fillet", "Lachsfilet", null, 125.0, ServingUnit.g, listOf(260.0, 25.0, 0.0, 17.5, 0.0), false),
            food("potatoes", "Potatoes", "Kartoffeln", null, 200.0, ServingUnit.g, listOf(154.0, 4.0, 31.0, 0.2, 4.2), false),
            food("avocado", "Avocado", "Avocado", null, 80.0, ServingUnit.g, listOf(128.0, 1.6, 1.5, 12.0, 5.4), false),
            food("bread", "Wholegrain bread", "Vollkornbrot", "Kornhaus", 60.0, ServingUnit.g, listOf(140.0, 5.4, 24.0, 1.8, 4.2), false),
            food("eggs", "Egg", "Ei", null, 60.0, ServingUnit.g, listOf(86.0, 7.5, 0.4, 6.0, 0.0), false),
            food("pasta", "Wholegrain pasta", "Vollkornpasta", null, 80.0, ServingUnit.g, listOf(278.0, 10.4, 52.0, 2.0, 6.4), false),
            food("sauce", "Tomato sauce", "Tomatensauce", "Kornhaus", 125.0, ServingUnit.g, listOf(50.0, 1.9, 8.0, 0.6, 2.0), false),
            food("cottage", "Cottage cheese", "Hüttenkäse", "Alpenhof", 200.0, ServingUnit.g, listOf(196.0, 25.0, 5.0, 8.6, 0.0), false),
            food("apple", "Apple", "Apfel", null, 150.0, ServingUnit.g, listOf(78.0, 0.4, 17.0, 0.3, 3.6), false),
            food("chocolate", "Dark chocolate", "Dunkle Schokolade", null, 20.0, ServingUnit.g, listOf(115.0, 1.8, 6.5, 8.6, 2.2), false),
        )

    private fun portion(
        meal: String,
        hour: Int,
        food: String,
        servings: Double,
    ) = Portion(meal, hour, food, servings)

    private val dayPlans =
        listOf(
            listOf(
                portion("Breakfast", 7, "oats", 1.2),
                portion("Breakfast", 7, "yogurt", 1.0),
                portion("Breakfast", 7, "blueberries", 1.0),
                portion("Breakfast", 7, "shake", 1.0),
                portion("Lunch", 12, "chicken", 1.0),
                portion("Lunch", 12, "rice", 1.0),
                portion("Lunch", 12, "broccoli", 1.0),
                portion("Lunch", 12, "oil", 1.0),
                portion("Snacks", 16, "banana", 1.0),
                portion("Snacks", 16, "almonds", 1.0),
                portion("Dinner", 19, "salmon", 1.0),
                portion("Dinner", 19, "potatoes", 1.0),
                portion("Dinner", 19, "avocado", 0.5),
                portion("Dinner", 19, "bread", 1.0),
            ),
            listOf(
                portion("Breakfast", 8, "eggs", 3.0),
                portion("Breakfast", 8, "bread", 2.0),
                portion("Breakfast", 8, "avocado", 1.0),
                portion("Lunch", 13, "pasta", 1.25),
                portion("Lunch", 13, "sauce", 1.5),
                portion("Lunch", 13, "chicken", 1.0),
                portion("Snacks", 16, "cottage", 1.0),
                portion("Snacks", 16, "apple", 1.0),
                portion("Dinner", 19, "salmon", 1.0),
                portion("Dinner", 19, "rice", 1.0),
                portion("Dinner", 19, "broccoli", 1.5),
                portion("Dinner", 20, "chocolate", 1.0),
            ),
            listOf(
                portion("Breakfast", 7, "oats", 1.5),
                portion("Breakfast", 7, "banana", 1.0),
                portion("Breakfast", 7, "shake", 1.0),
                portion("Breakfast", 7, "almonds", 0.5),
                portion("Lunch", 12, "chicken", 1.2),
                portion("Lunch", 12, "potatoes", 1.5),
                portion("Lunch", 12, "broccoli", 1.0),
                portion("Lunch", 12, "oil", 1.0),
                portion("Snacks", 15, "yogurt", 1.0),
                portion("Snacks", 15, "blueberries", 1.0),
                portion("Dinner", 19, "pasta", 1.0),
                portion("Dinner", 19, "sauce", 1.0),
                portion("Dinner", 19, "cottage", 0.5),
                portion("Dinner", 20, "apple", 1.0),
            ),
        )

    private const val DAYS = 35

    suspend fun seed(
        koin: Koin,
        german: Boolean,
    ): Ids {
        val foodRepo = koin.get<FoodRepository>()
        val recipeRepo = koin.get<RecipeRepository>()
        val entryRepo = koin.get<EntryRepository>()
        val weightRepo = koin.get<WeightRepository>()
        val sleepRepo = koin.get<SleepRepository>()
        val goalsRepo = koin.get<GoalsRepository>()
        val prefsRepo = koin.get<PreferencesRepository>()

        // Every create fires hooks that refresh widgets, the watch and Health Connect.
        // Hundreds of those add nothing to a screenshot, so they sit out the seeding.
        val onFoodChanged = foodRepo.onFoodChanged
        val onEntryChanged = entryRepo.onEntryChanged
        val onEntryCreated = entryRepo.onEntryCreated
        val onWeightChanged = weightRepo.onWeightChanged
        foodRepo.onFoodChanged = null
        entryRepo.onEntryChanged = null
        entryRepo.onEntryCreated = null
        weightRepo.onWeightChanged = null
        try {
            val zone = TimeZone.currentSystemDefault()
            val today = Clock.System.todayIn(zone)

            val created = HashMap<String, Food>()
            for (demo in foods) {
                created[demo.key] = foodRepo.createFood(foodCreate(demo, german))
            }

            fun id(key: String) = created.getValue(key).id

            val bowl =
                recipeRepo.createRecipe(
                    RecipeCreate(
                        name = if (german) "Poulet-Reis-Bowl" else "Chicken rice bowl",
                        totalServings = 2.0,
                        isFavorite = true,
                        ingredients =
                            listOf(
                                ingredient(id("chicken"), 300.0),
                                ingredient(id("rice"), 150.0),
                                ingredient(id("broccoli"), 300.0),
                                ingredient(id("oil"), 20.0, ServingUnit.ml),
                            ),
                        steps =
                            if (german) {
                                listOf(
                                    "Reis nach Packungsangabe kochen.",
                                    "Poulet würfeln und in Olivenöl goldbraun braten.",
                                    "Brokkoli fünf Minuten dämpfen.",
                                    "Alles in zwei Schalen anrichten.",
                                )
                            } else {
                                listOf(
                                    "Cook the rice as the packet says.",
                                    "Dice the chicken and fry it in olive oil until golden.",
                                    "Steam the broccoli for five minutes.",
                                    "Divide everything between two bowls.",
                                )
                            }.map { RecipeStepInput(text = it) },
                    ),
                )
            val oats =
                recipeRepo.createRecipe(
                    RecipeCreate(
                        name = "Overnight Oats",
                        totalServings = 2.0,
                        isFavorite = true,
                        ingredients =
                            listOf(
                                ingredient(id("oats"), 100.0),
                                ingredient(id("yogurt"), 300.0),
                                ingredient(id("blueberries"), 200.0),
                                ingredient(id("almonds"), 30.0),
                            ),
                        steps =
                            if (german) {
                                listOf(
                                    "Haferflocken und Joghurt verrühren.",
                                    "Über Nacht kalt stellen.",
                                    "Mit Heidelbeeren und Mandeln servieren.",
                                )
                            } else {
                                listOf(
                                    "Stir the oats into the yogurt.",
                                    "Chill overnight.",
                                    "Top with blueberries and almonds.",
                                )
                            }.map { RecipeStepInput(text = it) },
                    ),
                )

            goalsRepo.setGoals(
                Goals(
                    calorieGoal = 2200.0,
                    proteinGoal = 150.0,
                    carbGoal = 240.0,
                    fatGoal = 70.0,
                    fiberGoal = 30.0,
                    targetWeightKg = 75.0,
                    targetDate = today.plus(70, DateTimeUnit.DAY).toString(),
                ),
            )

            // The meals are what the dashboard should show; the optional cards would push
            // them below the fold. Without a stored preferences row the dashboard layout
            // never leaves "loading" in Local mode, so this also has to run.
            prefsRepo.updatePreferences(
                PreferencesUpdate(
                    showFastingWidget = false,
                    showWaterWidget = false,
                    showActivityWidget = false,
                    showNotesWidget = false,
                    showDayPropertiesWidget = false,
                    showSupplementsWidget = false,
                    showSleepWidget = false,
                    showWeightWidget = false,
                    showRecipeSuggestionsWidget = false,
                    widgetOrder =
                        listOf(
                            PreferencesUpdate.WidgetOrder.daylog,
                            PreferencesUpdate.WidgetOrder.chart,
                            PreferencesUpdate.WidgetOrder.favorites,
                            PreferencesUpdate.WidgetOrder.recipeMinusSuggestions,
                            PreferencesUpdate.WidgetOrder.supplements,
                            PreferencesUpdate.WidgetOrder.weight,
                            PreferencesUpdate.WidgetOrder.mealMinusBreakdown,
                            PreferencesUpdate.WidgetOrder.topMinusFoods,
                            PreferencesUpdate.WidgetOrder.sleep,
                            PreferencesUpdate.WidgetOrder.fasting,
                            PreferencesUpdate.WidgetOrder.water,
                            PreferencesUpdate.WidgetOrder.activity,
                            PreferencesUpdate.WidgetOrder.notes,
                            PreferencesUpdate.WidgetOrder.dayMinusProperties,
                            PreferencesUpdate.WidgetOrder.summary,
                        ),
                    timeZone = zone.id,
                ),
            )

            for (offset in 0 until DAYS) {
                val day = today.minus(offset, DateTimeUnit.DAY)
                seedEntries(entryRepo, offset, day, zone, created, german)
                seedBody(weightRepo, sleepRepo, offset, day)
            }

            return Ids(salmonFoodId = id("salmon"), oatsRecipeId = oats.id, bowlRecipeId = bowl.id)
        } finally {
            foodRepo.onFoodChanged = onFoodChanged
            entryRepo.onEntryChanged = onEntryChanged
            entryRepo.onEntryCreated = onEntryCreated
            weightRepo.onWeightChanged = onWeightChanged
        }
    }

    private suspend fun seedEntries(
        entryRepo: EntryRepository,
        offset: Int,
        day: LocalDate,
        zone: TimeZone,
        created: Map<String, Food>,
        german: Boolean,
    ) {
        // Today always uses the first plan at full size; earlier days rotate the plans
        // and scale them a little so the charts are not flat.
        val plan = dayPlans[offset % dayPlans.size]
        val scale = if (offset == 0) 1.0 else 1.0 + 0.12 * sin(offset * 1.7)
        plan.forEachIndexed { index, item ->
            val food = created[item.food] ?: return@forEachIndexed
            val eaten = LocalDateTime(day, LocalTime(item.hour, 10 + index)).toInstant(zone)
            val servings = (item.servings * scale * 10).roundToInt() / 10.0
            entryRepo.createEntry(
                EntryCreate(
                    mealType = item.meal,
                    servings = servings,
                    date = day.toString(),
                    foodId = food.id,
                    eatenAt = eaten.toString(),
                ),
                food = food,
            )
        }
    }

    private suspend fun seedBody(
        weightRepo: WeightRepository,
        sleepRepo: SleepRepository,
        offset: Int,
        day: LocalDate,
    ) {
        val rawWeight = 76.8 + offset * 0.05 + 0.25 * sin(offset * 1.3)
        weightRepo.createEntry(
            WeightCreate(weightKg = (rawWeight * 10).roundToInt() / 10.0, entryDate = day.toString()),
        )
        val minutes = 435 + (35 * sin(offset * 2.1)).toInt()
        val quality = 7 + (1.4 * sin(offset * 0.9)).roundToInt()
        sleepRepo.createEntry(
            SleepCreate(durationMinutes = minutes, quality = quality.toDouble(), entryDate = day.toString()),
        )
    }

    private fun ingredient(
        foodId: String,
        quantity: Double,
        unit: ServingUnit = ServingUnit.g,
    ) = RecipeIngredientInput(foodId = foodId, quantity = quantity, servingUnit = unit)

    private fun foodCreate(
        demo: DemoFood,
        german: Boolean,
    ): FoodCreate {
        // Rough, plausible values so the nutrient views are not empty.
        val salmon = demo.key == "salmon"
        return FoodCreate(
            name = if (german) demo.de else demo.en,
            brand = demo.brand,
            servingSize = demo.size,
            servingUnit = demo.unit,
            calories = demo.calories,
            protein = demo.protein,
            carbs = demo.carbs,
            fat = demo.fat,
            fiber = demo.fiber,
            isFavorite = demo.favorite,
            sugar = (demo.carbs * 2.5).roundToInt() / 10.0,
            saturatedFat = (demo.fat * 3).roundToInt() / 10.0,
            sodium = if (salmon) 75.0 else (20 + demo.protein * 6).roundToInt().toDouble(),
            potassium = if (salmon) 545.0 else (120 + demo.fiber * 60 + demo.protein * 8).roundToInt().toDouble(),
            calcium = (15 + demo.protein * 5).roundToInt().toDouble(),
            magnesium = if (salmon) 40.0 else (10 + demo.fiber * 9).roundToInt().toDouble(),
            iron = (3 + demo.fiber * 3.5).roundToInt() / 10.0,
            vitaminC = (demo.fiber * 6).roundToInt().toDouble(),
            // Lets the Insights nutrition cards (NOVA, omega ratio) show a result.
            omega3 = if (salmon) 2.4 else (demo.fat * 0.4).roundToInt() / 10.0,
            omega6 = if (salmon) 0.6 else (demo.fat * 1.2).roundToInt() / 10.0,
            novaGroup = if (demo.brand == null) 1 else 3,
            phosphorus = if (salmon) 360.0 else null,
            selenium = if (salmon) 54.0 else null,
            iodine = if (salmon) 45.0 else null,
            vitaminD = if (salmon) 16.5 else null,
            vitaminB3 = if (salmon) 12.0 else null,
            vitaminB6 = if (salmon) 0.9 else null,
            vitaminB12 = if (salmon) 4.8 else null,
        )
    }
}
