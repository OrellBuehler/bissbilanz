package com.bissbilanz.android.widget

import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.model.Entry
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlinx.serialization.json.Json

internal data class RecentFood(
    val id: String,
    val name: String,
    val calories: Double,
    val uses: Int,
    val lastLoggedOn: String,
)

/**
 * The foods this device has actually been logging, most-used first.
 *
 * Deliberately not the favorites table: the favorites widget already covers that
 * list, and a quick-add surface is only worth the home-screen space if it offers
 * what the user really eats. Reading the cached entries rather than `CachedFood`
 * also means the list holds up in Local mode, where nothing populates the food
 * cache — every entry carries the food it was logged with.
 */
internal object RecentFoods {
    const val LOOKBACK_DAYS = 30

    fun load(
        db: UserDataDatabase,
        json: Json,
        today: LocalDate,
        limit: Int,
    ): List<RecentFood> {
        val from = today.minus(LOOKBACK_DAYS, DateTimeUnit.DAY).toString()
        val entries =
            db.userDataDatabaseQueries
                .selectEntriesByDateRange(from, today.toString())
                .executeAsList()
                .mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }
        return rank(entries, limit, supplementFoodIds(db, json))
    }

    /**
     * The backing foods of every supplement ingredient.
     *
     * `/api/entries` does not return `supplementId`, so on a synced device the cached
     * ingredient entries look like ordinary logs; the ingredient's food id is the only
     * marker left. Reading all supplements (not just the active ones) keeps a paused
     * supplement's ingredients out too, as its old entries are still in the window.
     */
    private fun supplementFoodIds(
        db: UserDataDatabase,
        json: Json,
    ): Set<String> =
        db.userDataDatabaseQueries
            .selectAllSupplements()
            .executeAsList()
            .mapNotNull { json.decodeOrNull<Supplement>(it.jsonData) }
            .flatMap { supplement -> supplement.ingredients.map { it.foodId } }
            .toSet()

    /**
     * Ranks by how often a food was logged and only then by how recently, so a
     * daily staple isn't pushed off the list by yesterday's one-off.
     *
     * Supplement-generated entries are excluded. Logging one supplement creates an
     * entry per ingredient, so a daily ten-ingredient multivitamin would otherwise
     * contribute ten foods with ~30 uses each and take every quick-add row and every
     * dynamic shortcut, pushing out the real foods — and a single ingredient is not
     * something anyone would quick-add on its own. [supplementFoodIds] catches the
     * entries the server created (their `supplementId` is dropped by the day list
     * endpoint); the `supplementId` check catches the ones a downgrade stored locally.
     */
    fun rank(
        entries: List<Entry>,
        limit: Int,
        supplementFoodIds: Set<String> = emptySet(),
    ): List<RecentFood> =
        entries
            .filter { entry ->
                val foodId = entry.foodId
                entry.supplementId == null && (foodId == null || foodId !in supplementFoodIds)
            }.groupBy { it.foodId }
            .mapNotNull { (foodId, logged) ->
                if (foodId.isNullOrBlank()) return@mapNotNull null
                val name = logged.firstNotNullOfOrNull { it.food?.name ?: it.foodName } ?: return@mapNotNull null
                val calories = logged.firstNotNullOfOrNull { it.food?.calories ?: it.calories } ?: 0.0
                RecentFood(
                    id = foodId,
                    name = name,
                    calories = calories,
                    uses = logged.size,
                    lastLoggedOn = logged.maxOf { it.date },
                )
            }.sortedWith(
                compareByDescending<RecentFood> { it.uses }
                    .thenByDescending { it.lastLoggedOn }
                    .thenBy { it.name },
            ).take(limit)
}
