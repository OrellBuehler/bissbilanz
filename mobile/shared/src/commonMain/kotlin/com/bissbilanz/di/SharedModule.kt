package com.bissbilanz.di

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.DatabaseDriverFactory
import com.bissbilanz.repository.*
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.sync.SyncQueue
import kotlinx.serialization.json.Json
import org.koin.core.qualifier.named
import org.koin.dsl.module

val sharedModule =
    module {
        single { AuthManager(get<String>(named("baseUrl")), get()) }
        single { BissbilanzApi(get<String>(named("baseUrl")), get()) }
        single { BissbilanzDatabase(get<DatabaseDriverFactory>().createDriver()) }
        single { SyncQueue(get(), get()) }
        single {
            SyncManager(
                syncQueue = get(),
                connectivityProvider = get(),
                api = get(),
                json = get(),
            )
        }
        single {
            Json {
                ignoreUnknownKeys = true
                encodeDefaults = false
                isLenient = true
            }
        }
        single { FoodRepository(get(), get(), get(), get()) }
        single { EntryRepository(get(), get(), get(), get(), get()) }
        single { RecipeRepository(get(), get(), get(), get()) }
        single { GoalsRepository(get(), get(), get(), get()) }
        single { WeightRepository(get(), get(), get(), get(), get()) }
        single { SupplementRepository(get(), get(), get(), get()) }
        single { StatsRepository(get(), get(), get()) }
        single { PreferencesRepository(get(), get(), get(), get()) }
    }
