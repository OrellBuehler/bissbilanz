package com.bissbilanz.cache

import android.content.Context
import androidx.sqlite.db.SupportSQLiteDatabase
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import com.bissbilanz.userdata.UserDataDatabase

actual class DatabaseDriverFactory(
    private val context: Context,
) {
    actual fun createDriver(): SqlDriver {
        val driver = AndroidSqliteDriver(BissbilanzDatabase.Schema, context, "bissbilanz.db")
        // The Android driver only runs Schema.create on a brand-new database, so tables
        // added in app updates would never materialize on existing installs. Re-running
        // create here is idempotent because the schema is (and must remain)
        // IF-NOT-EXISTS-only and additive-only.
        BissbilanzDatabase.Schema.create(driver)
        return driver
    }

    actual fun createUserDataDriver(): SqlDriver {
        val driver =
            AndroidSqliteDriver(
                schema = UserDataDatabase.Schema,
                context = context,
                name = "userdata.db",
                callback =
                    object : AndroidSqliteDriver.Callback(UserDataDatabase.Schema) {
                        override fun onConfigure(db: SupportSQLiteDatabase) {
                            super.onConfigure(db)
                            // journal_mode=DELETE (no WAL): Android Auto Backup copies
                            // userdata.db as a single file, and a WAL database is only
                            // self-consistent together with its -wal/-shm sidecars.
                            // Write volume here is tiny, so DELETE journaling is fine.
                            db.disableWriteAheadLogging()
                            db.query("PRAGMA journal_mode=DELETE").use { it.moveToFirst() }
                        }
                    },
            )
        // Same idempotent-create pattern as createDriver(), see above.
        UserDataDatabase.Schema.create(driver)
        // One-time copy of user data out of the legacy single-database file (existing
        // installs have the user tables populated inside bissbilanz.db). Idempotent;
        // see LegacyUserDataMigration for the crash-safety story.
        val legacyDriver = AndroidSqliteDriver(BissbilanzDatabase.Schema, context, "bissbilanz.db")
        try {
            LegacyUserDataMigration.run(source = legacyDriver, target = driver)
        } finally {
            legacyDriver.close()
        }
        return driver
    }
}
