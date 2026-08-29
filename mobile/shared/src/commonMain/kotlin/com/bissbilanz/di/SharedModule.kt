package com.bissbilanz.di

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.DatabaseDriverFactory
import com.bissbilanz.cache.LocalDataWiper
import com.bissbilanz.migration.LocalDataMigrator
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.*
import com.bissbilanz.storage.PlainStorage
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.serialization.json.Json
import org.koin.core.qualifier.named
import org.koin.dsl.module

val sharedModule =
    module {
        single { AuthManager(get<String>(named("baseUrl")), get(), get()) }
        single { BissbilanzApi(get<String>(named("baseUrl")), get(), get()) }
        single { OpenFoodFactsClient(json = get()) }
        single { AppModeManager(get<PlainStorage>()) }
        // Two database files: bissbilanz.db (sync queue + server cache, excluded from
        // Android Auto Backup) and userdata.db (the user's data, included in backups).
        single { BissbilanzDatabase(get<DatabaseDriverFactory>().createDriver()) }
        single { UserDataDatabase(get<DatabaseDriverFactory>().createUserDataDriver()) }
        single { SyncQueue(get(), get(), get()) }
        single { LocalDataWiper(db = get(), cacheDb = get(), syncQueue = get()) }
        single {
            LocalDataMigrator(
                db = get(),
                cacheDb = get(),
                api = get(),
                json = get(),
                appModeManager = get(),
                syncQueue = get(),
                errorReporter = get(),
                localDataWiper = get(),
                // Platform-provided (Android only today) — reads back photos a
                // downgrade stored on-device so they can be re-uploaded.
                localPhotoReader = getOrNull(),
            )
        }
        single {
            SyncManager(
                syncQueue = get(),
                connectivityProvider = get(),
                api = get(),
                db = get(),
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
        single { FoodRepository(get(), get(), get(), get(), get(), get(), get(), get()) }
        single { EntryRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { RecipeRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { GoalsRepository(get(), get(), get(), get(), get(), get()) }
        single { WeightRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { SupplementRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { StatsRepository(get(), get(), get(), get(), get()) }
        single { SleepRepository(get(), get(), get(), get(), get(), get(), get()) }
        single { PreferencesRepository(get(), get(), get(), get(), get(), get()) }
        single { LocalAnalytics(get(), get()) }
        single { AnalyticsRepository(get(), get()) }
    }
