package com.bissbilanz.cache

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver
import com.bissbilanz.userdata.UserDataDatabase

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

    actual fun createUserDataDriver(): SqlDriver {
        val driver = NativeSqliteDriver(UserDataDatabase.Schema, "userdata.db")
        // Same idempotent-create pattern as createDriver(), see above. The legacy-data
        // copy is Android-only: the iOS app never shipped with the single-database
        // layout, so there is nothing to migrate here.
        UserDataDatabase.Schema.create(driver)
        return driver
    }
}
