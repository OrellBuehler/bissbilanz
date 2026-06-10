package com.bissbilanz.di

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.DatabaseDriverFactory
import com.bissbilanz.migration.LocalDataMigrator
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.*
import com.bissbilanz.storage.PlainStorage
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.sync.SyncQueue
import kotlinx.serialization.json.Json
import org.koin.core.qualifier.named
import org.koin.dsl.module

val sharedModule =
    module {
        single { AuthManager(get<String>(named("baseUrl")), get()) }
        single { BissbilanzApi(get<String>(named("baseUrl")), get()) }
        single { OpenFoodFactsClient() }
        single { AppModeManager(get<PlainStorage>()) }
        single { BissbilanzDatabase(get<DatabaseDriverFactory>().createDriver()) }
        single { SyncQueue(get(), get(), get()) }
        single {
            LocalDataMigrator(
                db = get(),
                api = get(),
                json = get(),
                appModeManager = get(),
                syncQueue = get(),
                errorReporter = get(),
            )
        }
        single {
            SyncManager(
                syncQueue = get(),
                connectivityProvider = get(),
                api = get(),
                json = get(),
                errorReporter = get(),
                appModeManager = get(),
            )
        }
        single {
            Json {
                ignoreUnknownKeys = true
                encodeDefaults = false
                isLenient = true
            }
        }
        single { FoodRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { EntryRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { RecipeRepository(get(), get(), get(), get(), get(), get()) }
        single { GoalsRepository(get(), get(), get(), get(), get()) }
        single { WeightRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { SupplementRepository(get(), get(), get(), get(), get(), get()) }
        single { StatsRepository(get(), get(), get(), get(), get()) }
        single { SleepRepository(get(), get(), get(), get(), get(), get()) }
        single { PreferencesRepository(get(), get(), get(), get(), get()) }
        single { AnalyticsRepository(get(), get()) }
    }
