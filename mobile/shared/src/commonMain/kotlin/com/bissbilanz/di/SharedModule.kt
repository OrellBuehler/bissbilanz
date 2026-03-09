package com.bissbilanz.di

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.repository.*
import org.koin.core.module.Module
import org.koin.dsl.module

val sharedModule = module {
    single { AuthManager(get(qualifier = org.koin.core.qualifier.named("baseUrl")), get(qualifier = org.koin.core.qualifier.named("clientId")), get(), get()) }
    single { BissbilanzApi(get(qualifier = org.koin.core.qualifier.named("baseUrl")), get(), get()) }
    single { FoodRepository(get()) }
    single { EntryRepository(get()) }
    single { RecipeRepository(get()) }
    single { GoalsRepository(get()) }
    single { WeightRepository(get()) }
    single { SupplementRepository(get()) }
    single { StatsRepository(get()) }
}
