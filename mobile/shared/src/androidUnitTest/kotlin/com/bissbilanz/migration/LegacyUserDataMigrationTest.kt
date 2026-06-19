package com.bissbilanz.migration

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.LegacyUserDataMigration
import com.bissbilanz.userdata.UserDataDatabase
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Tests the one-time copy of user data out of the legacy single-database file
 * (bissbilanz.db) into userdata.db. The copy routine is platform-neutral (raw
 * [SqlDriver] handles), so it is exercised here with two in-memory JVM drivers —
 * a real on-device AndroidSqliteDriver run is not JVM-testable.
 */
class LegacyUserDataMigrationTest {
    private lateinit var source: SqlDriver
    private lateinit var target: SqlDriver

    @BeforeTest
    fun setup() {
        source = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        target = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        UserDataDatabase.Schema.create(target)
    }

    @AfterTest
    fun teardown() {
        source.close()
        target.close()
    }

    /** Recreates the legacy bissbilanz.db layout: sync tables AND user tables in one file. */
    private fun createLegacyLayout() {
        BissbilanzDatabase.Schema.create(source)
        // The user-table DDL is identical to the new userdata schema, so reuse it to
        // create the legacy user tables (the extra LocalMeta table in the source is
        // inert — the migration only consults the target's LocalMeta).
        UserDataDatabase.Schema.create(source)
    }

    private fun seedSource() {
        val legacy = UserDataDatabase(source).userDataDatabaseQueries
        legacy.insertFood("food-1", "Apple", null, 52.0, 0.3, 14.0, 0.2, 2.4, 1L, "123456", "{}")
        legacy.insertFood("food-2", "Rice", "Brand", 130.0, 2.7, 28.0, 0.3, 0.4, 0L, null, "{}")
        legacy.insertEntry("entry-1", "2024-01-15", "lunch", 1.5, "food-1", null, "Apple", 78.0, 0.5, 21.0, 0.3, 3.6, "{}")
        legacy.insertRecipe("recipe-1", "Soup", 4.0, 0L, 100.0, 10.0, 12.0, 5.0, 2.0, "{}")
        legacy.insertSupplement("supp-1", "Magnesium", 1L, 0L, "{}")
        legacy.insertSupplementLog("supp-1-2024-01-15", "supp-1", "2024-01-15", "2024-01-15T08:00:00Z")
        legacy.insertWeightEntry("w-1", "2024-01-15", 80.5, "2024-01-15T07:00:00Z", "{}")
        legacy.insertSleepEntry("s-1", "2024-01-15", 480L, 4L, null, "{}")
        legacy.insertGoals(2000.0, 150.0, 250.0, 65.0, 30.0)
        legacy.insertPreferences("""{"startPage":"dashboard"}""")
        legacy.upsertDayProperties("2024-01-15", 1L)
    }

    @Test
    fun copiesAllUserTablesWritesMarkerAndDropsLegacyTables() {
        createLegacyLayout()
        seedSource()

        LegacyUserDataMigration.run(source, target)

        val copied = UserDataDatabase(target).userDataDatabaseQueries
        assertEquals(listOf("food-1", "food-2"), copied.selectAllFoods().executeAsList().map { it.id })
        val food = copied.selectFoodById("food-1").executeAsOne()
        assertEquals("Apple", food.name)
        assertEquals(52.0, food.calories)
        assertEquals(1L, food.isFavorite)
        assertEquals("123456", food.barcode)
        val entry = copied.selectAllEntries().executeAsList().single()
        assertEquals("entry-1", entry.id)
        assertEquals("food-1", entry.foodId)
        assertEquals(1.5, entry.servings)
        assertEquals(listOf("recipe-1"), copied.selectAllRecipes().executeAsList().map { it.id })
        assertEquals(listOf("supp-1"), copied.selectAllSupplements().executeAsList().map { it.id })
        assertEquals(listOf("supp-1-2024-01-15"), copied.selectAllSupplementLogs().executeAsList().map { it.id })
        assertEquals(listOf("w-1"), copied.selectAllWeightEntries().executeAsList().map { it.id })
        assertEquals(listOf("s-1"), copied.selectAllSleepEntries().executeAsList().map { it.id })
        assertEquals(2000.0, copied.selectGoals().executeAsOne().calorieGoal)
        assertEquals("""{"startPage":"dashboard"}""", copied.selectPreferences().executeAsOne().jsonData)
        assertEquals(1L, copied.selectDayProperties("2024-01-15").executeAsOne().isFastingDay)

        assertTrue(LegacyUserDataMigration.isCopied(target))
        // Legacy user tables are gone from the source; the sync tables survive.
        assertFalse(LegacyUserDataMigration.tableExists(source, "CachedFood"))
        assertFalse(LegacyUserDataMigration.tableExists(source, "CachedEntry"))
        assertFalse(LegacyUserDataMigration.tableExists(source, "CachedPreferences"))
        assertTrue(LegacyUserDataMigration.tableExists(source, "SyncQueue"))
        assertTrue(LegacyUserDataMigration.tableExists(source, "SyncMeta"))
        assertTrue(LegacyUserDataMigration.tableExists(source, "CachedMealType"))
    }

    @Test
    fun secondRunIsANoOpAndKeepsNewTargetRows() {
        createLegacyLayout()
        seedSource()
        LegacyUserDataMigration.run(source, target)

        // Data written after the migration must survive a re-run (e.g. app restart).
        val queries = UserDataDatabase(target).userDataDatabaseQueries
        queries.insertFood("food-3", "New", null, 1.0, 0.0, 0.0, 0.0, 0.0, 0L, null, "{}")

        LegacyUserDataMigration.run(source, target)

        assertEquals(
            listOf("food-1", "food-2", "food-3"),
            queries
                .selectAllFoods()
                .executeAsList()
                .map { it.id }
                .sorted(),
        )
    }

    @Test
    fun markerPreventsRecopyButLegacyTablesAreStillDropped() {
        createLegacyLayout()
        seedSource()
        // Simulate a restored backup: the marker arrived inside userdata.db.
        target.execute(null, "INSERT INTO LocalMeta(key, value) VALUES ('legacy_userdata_copied', '1')", 0)

        LegacyUserDataMigration.run(source, target)

        val copied = UserDataDatabase(target).userDataDatabaseQueries
        assertTrue(copied.selectAllFoods().executeAsList().isEmpty())
        // Cleanup of leftover legacy tables (crash between commit and drop) still runs.
        assertFalse(LegacyUserDataMigration.tableExists(source, "CachedFood"))
    }

    @Test
    fun freshInstallWithoutLegacyTablesJustWritesMarker() {
        // New install: bissbilanz.db only ever had the sync/cache tables.
        BissbilanzDatabase.Schema.create(source)

        LegacyUserDataMigration.run(source, target)

        assertTrue(LegacyUserDataMigration.isCopied(target))
        assertTrue(
            UserDataDatabase(target)
                .userDataDatabaseQueries
                .selectAllFoods()
                .executeAsList()
                .isEmpty(),
        )
    }

    @Test
    fun failedCopyRollsBackAndLeavesMarkerAbsent() {
        BissbilanzDatabase.Schema.create(source)
        // CachedEntry is valid and copied first…
        UserDataDatabase(source.also { UserDataDatabase.Schema.create(it) })
            .userDataDatabaseQueries
            .insertEntry("entry-1", "2024-01-15", "lunch", 1.0, null, null, null, 0.0, 0.0, 0.0, 0.0, 0.0, "{}")
        // …then CachedFood blows up mid-copy: replace it with an incompatible layout.
        source.execute(null, "DROP TABLE CachedFood", 0)
        source.execute(null, "CREATE TABLE CachedFood (id TEXT NOT NULL PRIMARY KEY)", 0)

        assertFails { LegacyUserDataMigration.run(source, target) }

        // The target transaction rolled back: no marker, no partial rows. The next
        // run (after a fix/update) starts from scratch.
        assertFalse(LegacyUserDataMigration.isCopied(target))
        assertTrue(
            UserDataDatabase(target)
                .userDataDatabaseQueries
                .selectAllEntries()
                .executeAsList()
                .isEmpty(),
        )
    }
}
