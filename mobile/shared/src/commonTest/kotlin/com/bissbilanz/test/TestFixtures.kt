package com.bissbilanz.test

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
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
