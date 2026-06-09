package com.bissbilanz.cache

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

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
}
