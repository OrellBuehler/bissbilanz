package com.bissbilanz.cache

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

actual class DatabaseDriverFactory {
    actual fun createDriver(): SqlDriver {
        val driver = NativeSqliteDriver(BissbilanzDatabase.Schema, "bissbilanz.db")
        // The native driver only runs Schema.create on a brand-new database, so tables
        // added in app updates would never materialize on existing installs. Re-running
        // create here is idempotent because the schema is (and must remain)
        // IF-NOT-EXISTS-only and additive-only.
        BissbilanzDatabase.Schema.create(driver)
        return driver
    }
}
