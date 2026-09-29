package com.bissbilanz.repository

import com.bissbilanz.api.generated.model.FoodUsageResponse
import com.bissbilanz.api.generated.model.RecipeUsageResponse
import com.bissbilanz.model.Entry
import com.bissbilanz.userdata.CachedEntry
import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.json.Json

/** The server caps the entry list at this many rows; the local computation matches it. */
const val WHERE_USED_ENTRY_LIMIT = 200

/** One diary entry that references a food or recipe. */
data class WhereUsedEntry(
    val id: String,
    val date: String,
    val mealType: String,
    val servings: Double,
    val eatenAt: String? = null,
)

/** A recipe or supplement that uses a food as an ingredient. */
data class WhereUsedRef(
    val id: String,
    val name: String,
    /** Recipes only: the food is the recipe's sole ingredient, so it cannot be removed. */
    val isLastIngredient: Boolean = false,
)

/**
 * Where a food or recipe is used, newest entry first. [entries] is capped at
 * [WHERE_USED_ENTRY_LIMIT]; [totalEntries] is the full count.
 */
data class WhereUsed(
    val entries: List<WhereUsedEntry>,
    val totalEntries: Int,
    val recipes: List<WhereUsedRef> = emptyList(),
    val supplements: List<WhereUsedRef> = emptyList(),
)

internal fun RecipeUsageResponse.toWhereUsed(): WhereUsed =
    WhereUsed(
        entries = propertyEntries.map { WhereUsedEntry(it.id, it.date, it.mealType, it.servings, it.eatenAt) },
        totalEntries = totalEntries,
    )

internal fun FoodUsageResponse.toWhereUsed(): WhereUsed =
    WhereUsed(
        entries = propertyEntries.map { WhereUsedEntry(it.id, it.date, it.mealType, it.servings, it.eatenAt) },
        totalEntries = totalEntries,
        recipes = recipes.map { WhereUsedRef(it.id, it.name, it.isLastIngredient) },
        supplements = supplements.map { WhereUsedRef(it.id, it.name) },
    )

/**
 * Newest first, like the server: by day, then by when the entry was eaten. Rows whose
 * JSON no longer decodes still count and sort by their columns alone.
 */
internal fun List<CachedEntry>.toWhereUsedEntries(json: Json): List<WhereUsedEntry> =
    map { row ->
        WhereUsedEntry(
            id = row.id,
            date = row.date,
            mealType = row.mealType,
            servings = row.servings,
            eatenAt = json.decodeOrNull<Entry>(row.jsonData)?.eatenAt,
        )
    }.sortedWith(
        compareByDescending<WhereUsedEntry> { it.date }.thenByDescending { it.eatenAt.orEmpty() },
    )
