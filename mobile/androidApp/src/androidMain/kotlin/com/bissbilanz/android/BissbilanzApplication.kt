package com.bissbilanz.android

import android.app.Application
import com.bissbilanz.HealthSyncService
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.android.ui.viewmodels.DayLogViewModel
import com.bissbilanz.android.ui.viewmodels.FavoritesViewModel
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.android.ui.viewmodels.InsightsViewModel
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.android.widget.MacroWidget
import com.bissbilanz.auth.SecureStorage
import com.bissbilanz.cache.DatabaseDriverFactory
import com.bissbilanz.di.sharedModule
import com.bissbilanz.health.HealthConnectService
import com.bissbilanz.repository.*
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncManager
import io.sentry.android.core.SentryAndroid
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin
import org.koin.core.module.dsl.viewModelOf
import org.koin.core.qualifier.named
import org.koin.dsl.module

class BissbilanzApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        if (BuildConfig.SENTRY_DSN.isNotBlank()) {
            SentryAndroid.init(this) { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.isAnrEnabled = true
                options.isAttachScreenshot = true
                options.isAttachViewHierarchy = true
                options.tracesSampleRate = 0.2
                options.environment = if (BuildConfig.DEBUG) "development" else "production"
            }
        }

        val androidModule =
            module {
                single(named("baseUrl")) { BuildConfig.BASE_URL }
                single { SecureStorage(androidContext()) }
                single { DatabaseDriverFactory(androidContext()) }
                single<HealthSyncService> { HealthConnectService(androidContext()) }
                single { ConnectivityProvider(androidContext()) }

                viewModelOf(::DashboardViewModel)
                viewModelOf(::DayLogViewModel)
                viewModelOf(::InsightsViewModel)
                viewModelOf(::FoodSearchViewModel)
                viewModelOf(::FavoritesViewModel)
                viewModelOf(::WeightViewModel)
            }

        startKoin {
            androidContext(this@BissbilanzApplication)
            modules(androidModule, sharedModule)
        }

        // Start sync manager to auto-sync queued writes when connectivity is restored
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        koin.get<EntryRepository>().onEntryChanged = {
            MacroWidget.updateAllWidgets(this@BissbilanzApplication)
        }

        koin.get<SyncManager>().startNetworkListener {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
            koin.get<EntryRepository>().refresh(today)
            koin.get<FoodRepository>().refreshFoods()
            koin.get<RecipeRepository>().refresh()
            koin.get<WeightRepository>().refresh()
            koin.get<SupplementRepository>().refresh()
            koin.get<GoalsRepository>().refresh()
            koin.get<PreferencesRepository>().refresh()
            MacroWidget.updateAllWidgets(this@BissbilanzApplication)
        }
    }
}
