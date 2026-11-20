package com.bissbilanz.android.navigation

/**
 * The rules of the configurable bottom bar: Home first, [MIN] to [MAX] chosen tabs in the
 * user's own order, Settings last.
 *
 * The ids are a vocabulary shared with iOS and the web (`src/lib/config/navigation.ts`),
 * and double as the nav routes on Android.
 */
object NavTabs {
    const val HOME = "dashboard"
    const val SETTINGS = "settings"
    const val MIN = 1
    const val MAX = 3

    /** Every destination that can be a tab, in the order the editor lists them. */
    val CANDIDATES =
        listOf(
            "foods",
            "favorites",
            "insights",
            "weight",
            "supplements",
            "recipe-suggestions",
            "recipes",
            "ai-tasks",
            "sleep",
            "calendar",
            "fasting",
        )

    /** Tabs that only exist with an account: hidden in Local mode, but kept in storage. */
    val ACCOUNT_ONLY = setOf("ai-tasks")

    val DEFAULT = listOf("foods", "favorites", "insights")

    /** How the old unordered StringSet was put on the bar. */
    private val LEGACY_ORDER = listOf("foods", "favorites", "insights", "weight", "supplements", "recipe-suggestions")

    private const val SEPARATOR = ","

    /**
     * The chosen tabs from the stored ordered list, or, before that list was ever written,
     * from the old unordered set.
     */
    fun load(
        stored: String?,
        legacy: Set<String>?,
    ): List<String> =
        when {
            stored != null -> sanitize(stored.split(SEPARATOR))
            legacy != null -> sanitize(LEGACY_ORDER.filter { it in legacy })
            else -> DEFAULT
        }

    fun serialize(ids: List<String>): String = ids.joinToString(SEPARATOR)

    /** Unknown ids (from a newer version, say) are dropped before the maximum is applied. */
    fun sanitize(ids: List<String>): List<String> =
        ids
            .map { it.trim() }
            .filter { it in CANDIDATES }
            .distinct()
            .take(MAX)
            .ifEmpty { DEFAULT }

    fun isAllowed(
        id: String,
        signedIn: Boolean,
    ): Boolean = signedIn || id !in ACCOUNT_ONLY

    /** The chosen tabs the bar actually shows in the current mode. */
    fun visible(
        ids: List<String>,
        signedIn: Boolean,
    ): List<String> = ids.filter { isAllowed(it, signedIn) }

    /** Everything on the bar, the fixed ends included. */
    fun barRoutes(visibleTabs: List<String>): List<String> = listOf(HOME) + visibleTabs + SETTINGS

    fun canAdd(
        ids: List<String>,
        id: String,
        signedIn: Boolean,
    ): Boolean = id in CANDIDATES && id !in ids && ids.size < MAX && isAllowed(id, signedIn)

    fun add(
        ids: List<String>,
        id: String,
        signedIn: Boolean,
    ): List<String> = if (canAdd(ids, id, signedIn)) ids + id else ids

    /** Hidden tabs do not count toward the minimum: the bar must keep a tab it can show. */
    fun canRemove(
        ids: List<String>,
        id: String,
        signedIn: Boolean,
    ): Boolean {
        if (id !in ids || ids.size <= MIN) return false
        return !isAllowed(id, signedIn) || visible(ids - id, signedIn).size >= MIN
    }

    fun remove(
        ids: List<String>,
        id: String,
        signedIn: Boolean,
    ): List<String> = if (canRemove(ids, id, signedIn)) ids - id else ids

    fun move(
        ids: List<String>,
        from: Int,
        to: Int,
    ): List<String> {
        if (from !in ids.indices || to !in ids.indices) return ids
        return ids.toMutableList().apply { add(to, removeAt(from)) }
    }

    /** Where the app opens: the stored choice while it is still on the bar, otherwise Home. */
    fun landingTab(
        stored: String?,
        visibleTabs: List<String>,
    ): String = stored?.takeIf { it in visibleTabs } ?: HOME

    /**
     * Whether a tab destination on screen is its tab's root: no back arrow, bar shown. A
     * destination on the bar is only ever reached by switching to its tab ([openDestination]),
     * never pushed, so being on the bar is enough; anything else is a pushed screen.
     */
    fun isTabRoot(
        route: String?,
        visibleTabs: List<String>,
    ): Boolean = route in visibleTabs
}
