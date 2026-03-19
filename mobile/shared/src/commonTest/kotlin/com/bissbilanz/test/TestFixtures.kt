package com.bissbilanz.test

import com.bissbilanz.model.Entry
import com.bissbilanz.model.Food
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
}
