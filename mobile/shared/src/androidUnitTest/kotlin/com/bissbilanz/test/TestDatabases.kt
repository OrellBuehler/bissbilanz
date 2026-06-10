package com.bissbilanz.test

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.userdata.UserDataDatabase

/** Fresh in-memory user-data database (userdata.db equivalent). */
fun inMemoryUserDataDatabase(): UserDataDatabase {
    val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
    UserDataDatabase.Schema.create(driver)
    return UserDataDatabase(driver)
}

/** Fresh in-memory cache database (bissbilanz.db equivalent: sync queue + meta). */
fun inMemoryCacheDatabase(): BissbilanzDatabase {
    val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
    BissbilanzDatabase.Schema.create(driver)
    return BissbilanzDatabase(driver)
}
