package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class RecipeRepository(private val api: BissbilanzApi) {
    private val _recipes = MutableStateFlow<List<Recipe>>(emptyList())
    val recipes: StateFlow<List<Recipe>> = _recipes.asStateFlow()

    suspend fun loadRecipes() {
        _recipes.value = api.getRecipes()
    }

    suspend fun getRecipe(id: String): Recipe = api.getRecipe(id)

    suspend fun createRecipe(recipe: RecipeCreate): Recipe {
        val created = api.createRecipe(recipe)
        loadRecipes()
        return created
    }

    suspend fun updateRecipe(id: String, recipe: RecipeUpdate): Recipe {
        val updated = api.updateRecipe(id, recipe)
        loadRecipes()
        return updated
    }

    suspend fun deleteRecipe(id: String) {
        api.deleteRecipe(id)
        _recipes.value = _recipes.value.filter { it.id != id }
    }
}
