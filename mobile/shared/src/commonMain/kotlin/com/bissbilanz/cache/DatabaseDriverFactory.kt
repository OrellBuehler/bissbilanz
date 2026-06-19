package com.bissbilanz.cache

import app.cash.sqldelight.db.SqlDriver

expect class DatabaseDriverFactory {
    /** Driver for BissbilanzDatabase (bissbilanz.db): sync queue + server cache. */
    fun createDriver(): SqlDriver

    /** Driver for UserDataDatabase (userdata.db): the user's own data. */
    fun createUserDataDriver(): SqlDriver
}
