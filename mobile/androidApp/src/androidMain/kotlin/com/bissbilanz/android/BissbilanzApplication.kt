package com.bissbilanz.android

import android.app.Application
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.fasting.FastingManager
import com.bissbilanz.android.fasting.FastingSessionStore
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.viewmodels.AddFoodViewModel
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.android.ui.viewmodels.DayLogViewModel
import com.bissbilanz.android.ui.viewmodels.FavoritesViewModel
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.android.ui.viewmodels.InsightsViewModel
import com.bissbilanz.android.ui.viewmodels.MigrationViewModel
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.android.ui.viewmodels.SleepViewModel
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.android.widget.FavoritesWidgetWorker
import com.bissbilanz.android.widget.MacroWidget
import com.bissbilanz.android.widget.QuickWeightWidget
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.SecureStorage
import com.bissbilanz.cache.DatabaseDriverFactory
import com.bissbilanz.di.sharedModule
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.*
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.storage.PlainStorage
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncManager
import io.sentry.android.core.SentryAndroid
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin
import org.koin.core.module.dsl.viewModelOf
import org.koin.core.qualifier.named
import org.koin.dsl.module
import java.io.IOException

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
                options.setBeforeSend { event, _ ->
                    val throwable = event.throwable
                    if (throwable != null && throwable.isAuthOrTransient()) null else event
                }
            }
        }

        val androidModule =
            module {
                single(named("baseUrl")) { BuildConfig.BASE_URL }
                single { SecureStorage(androidContext()) }
                single { PlainStorage(androidContext()) }
                single { DatabaseDriverFactory(androidContext()) }
                single { ConnectivityProvider(androidContext()) }
                single<ErrorReporter> { SentryErrorReporter() }
                single { RefreshManager(get(), get(), get(), get(), get(), get(), get(), get()) }
                single { FastingSessionStore(androidContext(), get()) }
                single { FastingManager(androidContext(), get(), get(), get()) }

                viewModelOf(::DashboardViewModel)
                viewModelOf(::DayLogViewModel)
                viewModelOf(::InsightsViewModel)
                viewModelOf(::FoodSearchViewModel)
                viewModelOf(::FavoritesViewModel)
                viewModelOf(::WeightViewModel)
                viewModelOf(::SleepViewModel)
                viewModelOf(::SettingsViewModel)
                viewModelOf(::AddFoodViewModel)
                viewModelOf(::MigrationViewModel)
            }

        startKoin {
            androidContext(this@BissbilanzApplication)
            modules(androidModule, sharedModule)
        }

        if (BuildConfig.TEST_AUTH_TOKEN.isNotEmpty() && isInstrumentedTest()) {
            val koinForAuth =
                org.koin.java.KoinJavaComponent
                    .getKoin()
            koinForAuth.get<AuthManager>().injectTestToken(BuildConfig.TEST_AUTH_TOKEN)
        }

        // Start sync manager to auto-sync queued writes when connectivity is restored
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()

        // Load the persisted app mode before any sync can start, so Local mode is
        // respected from the first connectivity event onwards.
        koin.get<AppModeManager>().initialize()

        koin.get<EntryRepository>().onEntryChanged = {
            MacroWidget.updateAllWidgets(this@BissbilanzApplication)
        }
        koin.get<FoodRepository>().onFoodChanged = {
            WorkManager
                .getInstance(this@BissbilanzApplication)
                .enqueue(
                    OneTimeWorkRequestBuilder<FavoritesWidgetWorker>()
                        .build(),
                )
        }
        koin.get<WeightRepository>().onWeightChanged = {
            QuickWeightWidget.updateAllWidgets(this@BissbilanzApplication)
        }

        val refreshManager = koin.get<RefreshManager>()
        koin.get<SyncManager>().startNetworkListener {
            refreshManager.refreshAll()
            MacroWidget.updateAllWidgets(this@BissbilanzApplication)
            QuickWeightWidget.updateAllWidgets(this@BissbilanzApplication)
            WorkManager
                .getInstance(this@BissbilanzApplication)
                .enqueue(
                    OneTimeWorkRequestBuilder<FavoritesWidgetWorker>()
                        .build(),
                )
        }
    }

    private fun isInstrumentedTest(): Boolean =
        try {
            Class.forName("androidx.test.InstrumentationRegistry")
            true
        } catch (_: ClassNotFoundException) {
            false
        }
}

private fun Throwable.isAuthOrTransient(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is UnauthorizedException) return true
        if (current is IOException) return true
        current = current.cause
    }
    return false
}
