package com.bissbilanz.di

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.repository.*
import org.koin.core.qualifier.named
import org.koin.dsl.module

val sharedModule =
    module {
        single { AuthManager(get<String>(named("baseUrl")), get<String>(named("clientId")), get()) }
        single { BissbilanzApi(get<String>(named("baseUrl")), get()) }
        single { FoodRepository(get()) }
        single { EntryRepository(get()) }
        single { RecipeRepository(get()) }
        single { GoalsRepository(get()) }
        single { WeightRepository(get()) }
        single { SupplementRepository(get()) }
        single { StatsRepository(get()) }
    }
