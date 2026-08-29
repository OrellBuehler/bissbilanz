package com.bissbilanz.android

import android.app.Application
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.aitasks.AiTaskNotificationPreferences
import com.bissbilanz.android.aitasks.AiTaskNotifier
import com.bissbilanz.android.aitasks.AiTaskPollWorker
import com.bissbilanz.android.fasting.FastingManager
import com.bissbilanz.android.fasting.FastingSessionStore
import com.bissbilanz.android.health.HealthConnectService
import com.bissbilanz.android.health.HealthExporter
import com.bissbilanz.android.health.HealthImporter
import com.bissbilanz.android.health.HealthSyncPreferences
import com.bissbilanz.android.reminders.RescheduleRemindersWorker
import com.bissbilanz.android.reminders.SupplementReminderPreferences
import com.bissbilanz.android.sync.AccountDowngradeController
import com.bissbilanz.android.sync.AndroidLocalPhotoReader
import com.bissbilanz.android.sync.AndroidPhotoLocalizer
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.viewmodels.AddFoodViewModel
import com.bissbilanz.android.ui.viewmodels.AiTasksViewModel
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.android.ui.viewmodels.DayLogViewModel
import com.bissbilanz.android.ui.viewmodels.FavoritesViewModel
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.android.ui.viewmodels.InsightsViewModel
import com.bissbilanz.android.ui.viewmodels.MigrationViewModel
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.android.ui.viewmodels.SleepViewModel
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.android.wear.WearStatePublisher
import com.bissbilanz.android.widget.FavoritesWidgetWorker
import com.bissbilanz.android.widget.MacroWidget
import com.bissbilanz.android.widget.QuickWeightWidget
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.SecureStorage
import com.bissbilanz.cache.DatabaseDriverFactory
import com.bissbilanz.di.sharedModule
import com.bissbilanz.migration.AccountDowngrader
import com.bissbilanz.migration.LocalDataMigrator
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.*
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.storage.PlainStorage
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncManager
import io.sentry.android.core.SentryAndroid
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
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
                // Outlives every screen: the account downgrade must not be
                // cancelled halfway through by the user leaving Settings.
                single { CoroutineScope(SupervisorJob() + Dispatchers.Default) }
                single<LocalDataMigrator.LocalPhotoReader> { AndroidLocalPhotoReader(androidContext()) }
                single { RefreshManager(get(), get(), get(), get(), get(), get(), get(), get(), get()) }
                single {
                    AccountDowngrader(
                        api = get(),
                        db = get(),
                        syncQueue = get(),
                        authManager = get(),
                        appModeManager = get(),
                        json = get(),
                        photoLocalizer = AndroidPhotoLocalizer(androidContext(), get()),
                    )
                }
                single {
                    AccountDowngradeController(
                        accountDowngrader = get(),
                        syncManager = get(),
                        errorReporter = get(),
                        scope = get(),
                    )
                }
                single { FastingSessionStore(androidContext(), get()) }
                single { FastingManager(androidContext(), get(), get(), get()) }
                single { HealthConnectService(androidContext()) }
                single { HealthSyncPreferences(androidContext()) }
                single { SupplementReminderPreferences(androidContext()) }
                single { AiTaskNotificationPreferences(androidContext()) }
                single { HealthImporter(get(), get(), get(), get(), get()) }
                single { HealthExporter(androidContext(), get(), get(), get(), get(), get(), get()) }
                single { WearStatePublisher(androidContext(), get(), get(), get(), get(), get(), get()) }

                viewModelOf(::AiTasksViewModel)
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

        val healthExporter = koin.get<HealthExporter>()
        val today = { Clock.System.todayIn(TimeZone.currentSystemDefault()).toString() }

        val wearPublisher = koin.get<WearStatePublisher>()

        koin.get<EntryRepository>().onEntryChanged = {
            MacroWidget.updateAllWidgets(this@BissbilanzApplication)
            healthExporter.exportNutrition(today())
            wearPublisher.publish()
        }
        // Entries logged elsewhere (web, MCP, iOS) arrive via refresh, not
        // onEntryChanged — export the refreshed day so Health Connect follows.
        koin.get<EntryRepository>().onEntriesRefreshed = { date ->
            healthExporter.exportNutrition(date)
        }
        koin.get<FoodRepository>().onFoodChanged = {
            WorkManager
                .getInstance(this@BissbilanzApplication)
                .enqueue(
                    OneTimeWorkRequestBuilder<FavoritesWidgetWorker>()
                        .build(),
                )
            // Favourites drive the watch's quick-log list.
            wearPublisher.publish()
        }
        val publishWeight: suspend () -> Unit = {
            QuickWeightWidget.updateAllWidgets(this@BissbilanzApplication)
            healthExporter.exportLatestWeight()
            wearPublisher.publish()
        }
        koin.get<WeightRepository>().onWeightChanged = publishWeight
        // Weights logged elsewhere (web, MCP, iOS) arrive via refresh, not
        // onWeightChanged — same three consumers, or Health Connect, the widget and
        // the watch all keep showing the last weight entered on this device.
        koin.get<WeightRepository>().onWeightRefreshed = publishWeight

        // Any supplement change can move an alarm: the schedule, the reminder times and
        // the active flag all live on the supplement. This one hook covers create,
        // update, delete and the server refresh (which caches row by row) — the worker's
        // unique work collapses the resulting burst into a single reschedule.
        koin.get<SupplementRepository>().onSupplementsChanged = {
            RescheduleRemindersWorker.enqueue(this@BissbilanzApplication)
        }
        // Alarms do not survive a reboot, an app update, or an OEM task-killer, so arm
        // them from a known-good state on every start.
        RescheduleRemindersWorker.enqueue(this)

        // The assistant dismissing a task is the one AI task outcome the user has to
        // hear about — the meal never got logged. Acknowledgement happens when the list
        // is opened, not when a notification is posted, so repeat suppression is local.
        val aiTaskNotificationPrefs = koin.get<AiTaskNotificationPreferences>()
        koin.get<AiTaskRepository>().onUnreadDismissals = { unread, knownIds ->
            val fresh = aiTaskNotificationPrefs.unnotified(unread.map { it.id })
            val shown =
                fresh.isNotEmpty() &&
                    AiTaskNotifier.showDismissed(
                        this@BissbilanzApplication,
                        unread.filter { it.id in fresh },
                    )
            // Only ids we actually put on screen, and pruned against every id the
            // server returned — pruning against just the unread ones would drop an
            // id a concurrent refresh had already recorded, re-alerting the user.
            aiTaskNotificationPrefs.markNotified(if (shown) fresh else emptyList(), knownIds)
        }
        // Nothing else pulls AI tasks while the app is closed — there is no push
        // channel, and the only other periodic work exists solely for the widgets.
        AiTaskPollWorker.enqueue(this)

        val refreshManager = koin.get<RefreshManager>()
        // A conflict means the local row lost to a newer change; pull the server state
        // so the screen stops showing the value that was dropped.
        koin.get<SyncManager>().onConflictResolved = { refreshManager.refreshAll() }
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
