package com.bissbilanz.sync

data class UrlMeta(
    val affectedTable: String?,
    val affectedId: String?,
)

private val TABLE_MAP =
    mapOf(
        "foods" to "foods",
        "entries" to "entries",
        "recipes" to "recipes",
        "goals" to "goals",
        "preferences" to "preferences",
        "meal-types" to "mealTypes",
        "supplements" to "supplements",
        "weight" to "weight",
    )

fun urlToMeta(url: String): UrlMeta {
    val path = url.substringBefore("?")
    val parts = path.split("/").filter { it.isNotEmpty() }
    // Expected shape: ["api", "resource", optionalId]
    if (parts.size < 2 || parts[0] != "api") return UrlMeta(null, null)

    val table = TABLE_MAP[parts[1]]
    val id = if (parts.size >= 3) parts[2] else null
    return UrlMeta(table, id)
}
