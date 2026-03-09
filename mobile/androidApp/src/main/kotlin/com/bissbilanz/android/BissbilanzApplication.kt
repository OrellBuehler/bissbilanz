package com.bissbilanz.android

import android.app.Application
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.SecureStorage
import com.bissbilanz.createHttpEngine
import com.bissbilanz.di.sharedModule
import io.ktor.client.engine.*
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin
import org.koin.core.qualifier.named
import org.koin.dsl.module

class BissbilanzApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val androidModule = module {
            single(named("baseUrl")) { "https://bissbilanz.app" }
            single(named("clientId")) { "bissbilanz-android" }
            single<HttpClientEngine> { createHttpEngine() }
            single { SecureStorage(androidContext()) }
        }

        startKoin {
            androidContext(this@BissbilanzApplication)
            modules(androidModule, sharedModule)
        }
    }
}
