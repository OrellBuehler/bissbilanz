package com.bissbilanz.cache

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import com.bissbilanz.userdata.UserDataDatabase

/**
 * One-time copy of the user-data tables out of the legacy single-database file
 * (bissbilanz.db) into the dedicated user-data database (userdata.db).
 *
 * Before the database split every table lived in bissbilanz.db, which is excluded
 * from Android Auto Backup. Existing installs therefore have their user data inside
 * the cache file; on the first open of userdata.db this routine copies all rows over
 * and then drops the legacy tables (BissbilanzDatabase.Schema no longer creates
 * them, so they stay gone).
 *
 * Idempotency / crash-safety:
 * - The copy and the [MARKER_KEY] row in the target's LocalMeta table are committed
 *   in ONE transaction on the target. A crash mid-copy rolls everything back and the
 *   copy simply reruns on the next open; a present marker means the copy committed.
 * - Dropping the legacy tables in the source happens only after the marker is known
 *   to be committed, and uses DROP TABLE IF EXISTS, so a crash between commit and
 *   drop is healed on the next run.
 * - Fresh installs have no legacy tables (missing tables are skipped); the marker is
 *   still written so nothing reruns. A userdata.db restored via Auto Backup carries
 *   the marker with it, which correctly prevents re-copying from the (empty) cache
 *   database on the new device.
 */
object LegacyUserDataMigration {
    internal const val MARKER_KEY = "legacy_userdata_copied"

    /** Copies user data from [source] (legacy bissbilanz.db) into [target] (userdata.db). */
    fun run(
        source: SqlDriver,
        target: SqlDriver,
    ) {
        if (!isCopied(target)) {
            UserDataDatabase(target).userDataDatabaseQueries.transaction {
                for (table in legacyTables) {
                    if (tableExists(source, table.name)) copyTable(source, target, table)
                }
                target.execute(
                    identifier = null,
                    sql = "INSERT OR REPLACE INTO LocalMeta(key, value) VALUES ('$MARKER_KEY', '1')",
                    parameters = 0,
                )
            }
        }
        // Only reached once the copy (from this or an earlier run) has committed, so
        // removing the legacy tables is always safe — and idempotent via IF EXISTS.
        for (table in legacyTables) {
            source.execute(identifier = null, sql = "DROP TABLE IF EXISTS ${table.name}", parameters = 0)
        }
    }

    /** True when the marker row is present, i.e. the copy has committed before. */
    internal fun isCopied(target: SqlDriver): Boolean =
        target
            .executeQuery(
                identifier = null,
                sql = "SELECT 1 FROM LocalMeta WHERE key = '$MARKER_KEY'",
                mapper = { cursor -> QueryResult.Value(cursor.next().value) },
                parameters = 0,
            ).value

    internal fun tableExists(
        driver: SqlDriver,
        name: String,
    ): Boolean =
        driver
            .executeQuery(
                identifier = null,
                sql = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '$name'",
                mapper = { cursor -> QueryResult.Value(cursor.next().value) },
                parameters = 0,
            ).value

    private fun copyTable(
        source: SqlDriver,
        target: SqlDriver,
        table: Table,
    ) {
        val columns = table.columns.joinToString(", ") { it.name }
        val placeholders = table.columns.joinToString(", ") { "?" }
        source
            .executeQuery(
                identifier = null,
                sql = "SELECT $columns FROM ${table.name}",
                mapper = { cursor ->
                    while (cursor.next().value) {
                        target.execute(
                            identifier = null,
                            sql = "INSERT OR REPLACE INTO ${table.name}($columns) VALUES ($placeholders)",
                            parameters = table.columns.size,
                        ) {
                            table.columns.forEachIndexed { index, column ->
                                when (column.type) {
                                    ColumnType.TEXT -> bindString(index, cursor.getString(index))
                                    ColumnType.REAL -> bindDouble(index, cursor.getDouble(index))
                                    ColumnType.INTEGER -> bindLong(index, cursor.getLong(index))
                                }
                            }
                        }
                    }
                    QueryResult.Unit
                },
                parameters = 0,
            ).value
    }

    private enum class ColumnType { TEXT, REAL, INTEGER }

    private class Column(
        val name: String,
        val type: ColumnType,
    )

    private class Table(
        val name: String,
        vararg val columns: Column,
    )

    private fun text(name: String) = Column(name, ColumnType.TEXT)

    private fun real(name: String) = Column(name, ColumnType.REAL)

    private fun integer(name: String) = Column(name, ColumnType.INTEGER)

    /** The user-data tables exactly as they existed in the legacy bissbilanz.db schema. */
    private val legacyTables =
        listOf(
            Table(
                "CachedEntry",
                text("id"),
                text("date"),
                text("mealType"),
                real("servings"),
                text("foodId"),
                text("recipeId"),
                text("foodName"),
                real("calories"),
                real("protein"),
                real("carbs"),
                real("fat"),
                real("fiber"),
                text("jsonData"),
            ),
            Table(
                "CachedFood",
                text("id"),
                text("name"),
                text("brand"),
                real("calories"),
                real("protein"),
                real("carbs"),
                real("fat"),
                real("fiber"),
                integer("isFavorite"),
                text("barcode"),
                text("jsonData"),
            ),
            Table(
                "CachedGoals",
                integer("id"),
                real("calorieGoal"),
                real("proteinGoal"),
                real("carbGoal"),
                real("fatGoal"),
                real("fiberGoal"),
            ),
            Table(
                "CachedRecipe",
                text("id"),
                text("name"),
                real("totalServings"),
                integer("isFavorite"),
                real("calories"),
                real("protein"),
                real("carbs"),
                real("fat"),
                real("fiber"),
                text("jsonData"),
            ),
            Table(
                "CachedSupplement",
                text("id"),
                text("name"),
                integer("isActive"),
                integer("sortOrder"),
                text("jsonData"),
            ),
            Table(
                "CachedSupplementLog",
                text("id"),
                text("supplementId"),
                text("date"),
                text("takenAt"),
            ),
            Table(
                "CachedWeightEntry",
                text("id"),
                text("entryDate"),
                real("weightKg"),
                text("loggedAt"),
                text("jsonData"),
            ),
            Table(
                "CachedSleepEntry",
                text("id"),
                text("entryDate"),
                integer("durationMinutes"),
                integer("quality"),
                text("loggedAt"),
                text("jsonData"),
            ),
            Table(
                "CachedPreferences",
                integer("id"),
                text("jsonData"),
            ),
            Table(
                "CachedDayProperties",
                text("date"),
                integer("isFastingDay"),
            ),
        )
}
