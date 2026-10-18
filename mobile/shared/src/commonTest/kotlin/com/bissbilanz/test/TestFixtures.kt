package com.bissbilanz.test

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskClaudeProcessing
import com.bissbilanz.api.generated.model.AiTaskProposalItem
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals

object TestFixtures {
    fun food(
        id: String = "food-1",
        name: String = "Test Food",
        isFavorite: Boolean = false,
    ) = Food(
        id = id,
        userId = "user-1",
        name = name,
        servingSize = 100.0,
        servingUnit = Food.ServingUnit.g,
        calories = 200.0,
        protein = 20.0,
        carbs = 25.0,
        fat = 8.0,
        fiber = 3.0,
        brand = null,
        barcode = null,
        isFavorite = isFavorite,
        nutriScore = null,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        imageUrl = null,
    )

    fun entry(
        id: String = "entry-1",
        mealType: String = "lunch",
        foodName: String = "Test Food",
        date: String = "2024-01-15",
    ) = Entry(
        id = id,
        userId = "user-1",
        foodId = "food-$id",
        date = date,
        mealType = mealType,
        servings = 1.0,
        food = food(id = "food-$id", name = foodName),
    )

    fun goals() =
        Goals(
            calorieGoal = 2000.0,
            proteinGoal = 150.0,
            carbGoal = 250.0,
            fatGoal = 65.0,
            fiberGoal = 30.0,
        )

    fun aiTask(
        id: String = "task-1",
        status: AiTask.Status = AiTask.Status.pending,
        description: String? = "Oatmeal with banana",
        photoUrls: List<String> = emptyList(),
        date: String = "2024-01-15",
        mealType: String? = "Breakfast",
        eatenAt: String? = null,
        processedBy: AiTask.ProcessedBy? = null,
        processedByKind: String? = null,
        claudeProcessing: AiTaskClaudeProcessing? = null,
    ) = AiTask(
        id = id,
        userId = "user-1",
        status = status,
        description = description,
        photoUrl = null,
        photoUrls = photoUrls,
        date = date,
        mealType = mealType,
        eatenAt = eatenAt,
        source = "android",
        resultSummary = null,
        createdEntryIds = null,
        completedAt = null,
        dismissedAt = null,
        acknowledgedAt = null,
        processedBy = processedBy,
        processedByKind = processedByKind,
        claudeProcessing = claudeProcessing,
    )

    fun proposalItem(
        id: String = "item-1",
        name: String = "Egg",
    ) = AiTaskProposalItem(
        id = id,
        name = name,
        quantityDescription = "2 eggs",
        foodId = null,
        recipeId = null,
        servings = 2.0,
        calories = 156.0,
        protein = 12.6,
        carbs = 1.2,
        fat = 10.6,
        fiber = 0.0,
        newFood = null,
    )

    fun preferences(
        processor: Preferences.AiTaskProcessor = Preferences.AiTaskProcessor.assistant,
        processorKind: String? = null,
    ) = Preferences(
        showChartWidget = true,
        showFavoritesWidget = true,
        showRecipeSuggestionsWidget = true,
        showSupplementsWidget = true,
        showWeightWidget = true,
        showMealBreakdownWidget = true,
        showTopFoodsWidget = true,
        showSleepWidget = true,
        showFastingWidget = true,
        showDayPropertiesWidget = true,
        showWaterWidget = true,
        showActivityWidget = true,
        showNotesWidget = true,
        widgetOrder = emptyList(),
        mealOrder = emptyList(),
        startPage = "dashboard",
        favoriteTapAction = "instant",
        favoriteMealAssignmentMode = "time_based",
        visibleNutrients = emptyList(),
        waterGoalMl = 2000,
        locale = null,
        timeZone = "UTC",
        favoriteMealTimeframes = emptyList(),
        activityGoalAdjustment = false,
        activityCreditPercent = 100,
        aiTaskProcessor = processor,
        aiTaskAutoLog = false,
        aiTaskProcessorKind = processorKind,
    )

    fun offProduct(
        barcode: String = "4000000000001",
        name: String = "OFF Apple Juice",
        brand: String? = "OFF brand",
    ): OpenFoodFactsProduct =
        OpenFoodFactsProduct(
            id = barcode,
            name = name,
            brand = brand,
            barcode = barcode,
            imageUrl = null,
            nutriScore = null,
            novaGroup = null,
            servingSize = 100.0,
            servingUnit = "g",
            calories = 45.0,
            protein = 0.1,
            carbs = 10.0,
            fat = 0.0,
            fiber = 0.2,
            additives = null,
            ingredientsText = null,
        )
}
