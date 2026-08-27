import AppIntents
import SwiftData
import SwiftUI
import UserNotifications

/// Top-level destination shown at the app root, resolved from auth state and app mode.
enum RootDestination {
    case login
    case app
    case migration
}

/// Pure routing decision: which root destination to show for the given
/// `authState` and `mode`.
///
/// - Local mode is fully anonymous, so an unauthenticated user still sees the app.
/// - A successful login while in Local mode means the local data must be
///   migrated to the account first, so the migration screen is shown.
/// - The login screen only shows when no mode was chosen yet — a fresh install
///   or after an explicit sign-out (which clears the mode). A Synced user whose
///   session dies stays in the app (all data is local) and is prompted to sign
///   in again from there.
func resolveRootDestination(authState: AuthState, mode: AppMode?) -> RootDestination {
    switch authState {
    case .authenticated, .refreshing:
        mode == .local ? .migration : .app
    case .expired:
        .app
    case .unauthenticated:
        mode == nil ? .login : .app
    }
}

@main
struct BissbilanzApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var authManager: AuthManager
    @State private var api: BissbilanzAPI
    @State private var appModeManager: AppModeManager
    @State private var connectivityMonitor: ConnectivityMonitor
    @State private var syncManager: SyncManager
    @State private var migrator: LocalDataMigrator
    @State private var entryRepository: EntryRepository
    @State private var foodRepository: FoodRepository
    @State private var recipeRepository: RecipeRepository
    @State private var weightRepository: WeightRepository
    @State private var sleepRepository: SleepRepository
    @State private var supplementRepository: SupplementRepository
    @State private var goalsRepository: GoalsRepository
    @State private var preferencesRepository: PreferencesRepository
    @State private var deepLinkRouter: DeepLinkRouter
    @State private var mealEstimator: MealEstimator
    @State private var fastingManager: FastingTimerManager
    private let modelContainer: ModelContainer

    init() {
        // Start crash reporting before anything else can fail.
        ErrorReporter.start()

        let auth = AuthManager()
        let api = BissbilanzAPI(authManager: auth)
        let appMode = AppModeManager()
        let connectivity = ConnectivityMonitor()
        connectivity.start()

        // CloudKit mirroring runs only in Local (anonymous) mode — Synced mode
        // already syncs through the backend (see LocalStore). The mode is read
        // once at launch, so toggling it takes effect on the next launch.
        let container = LocalStore.makeContainerWithFallback(
            cloudKitEnabled: appMode.isLocal,
            onError: { error, context in ErrorReporter.capture(error, context: context) }
        )
        modelContainer = container
        let context = container.mainContext

        let sync = SyncManager(context: context, api: api, appMode: appMode, connectivity: connectivity)

        _authManager = State(wrappedValue: auth)
        _api = State(wrappedValue: api)
        _appModeManager = State(wrappedValue: appMode)
        _connectivityMonitor = State(wrappedValue: connectivity)
        _syncManager = State(wrappedValue: sync)
        _migrator = State(wrappedValue: LocalDataMigrator(
            context: context,
            api: api,
            appMode: appMode,
            syncManager: sync
        ))
        let entryRepo = EntryRepository(context: context, api: api, appMode: appMode, syncManager: sync)
        let foodRepo = FoodRepository(context: context, api: api, appMode: appMode, syncManager: sync)
        let recipeRepo = RecipeRepository(context: context, api: api, appMode: appMode, syncManager: sync)
        let weightRepo = WeightRepository(context: context, api: api, appMode: appMode, syncManager: sync)
        let sleepRepo = SleepRepository(context: context, api: api, appMode: appMode, syncManager: sync)
        _entryRepository = State(wrappedValue: entryRepo)
        _foodRepository = State(wrappedValue: foodRepo)
        _recipeRepository = State(wrappedValue: recipeRepo)
        _weightRepository = State(wrappedValue: weightRepo)
        _sleepRepository = State(wrappedValue: sleepRepo)
        let supplementRepo = SupplementRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        )
        _supplementRepository = State(wrappedValue: supplementRepo)
        let goalsRepo = GoalsRepository(context: context, api: api, appMode: appMode, syncManager: sync)
        _goalsRepository = State(wrappedValue: goalsRepo)
        _preferencesRepository = State(wrappedValue: PreferencesRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _mealEstimator = State(wrappedValue: MealEstimator(foodRepository: foodRepo))

        let router = DeepLinkRouter()
        _deepLinkRouter = State(wrappedValue: router)
        _fastingManager = State(wrappedValue: FastingTimerManager(entryRepository: entryRepo))

        // App Intents (Siri / Spotlight / Shortcuts) run in a separate launch of
        // the app — outside the SwiftUI environment the views use — so resolve
        // their dependencies through AppDependencyManager. Registered here in
        // init so they exist even when the system background-launches us purely
        // to service an intent. EntryWriter wraps the same repositories/context
        // the UI uses, so an intent log shares the offline-first sync path.
        let entryWriter = EntryWriter(
            entryRepository: entryRepo,
            foodRepository: foodRepo,
            recipeRepository: recipeRepo,
            syncManager: sync
        )
        AppDependencyManager.shared.add(dependency: entryWriter)
        AppDependencyManager.shared.add(dependency: router)
        IntentDonations.isEnabled = true

        // Apple Watch link (Phase 1). The watch relays "log this" commands here;
        // the phone performs the real write through the same repository the UI
        // uses, then replies with the refreshed snapshot.
        PhoneWatchConnectivity.shared.onLogRequest = { request in
            let food = request.foodId.flatMap { foodRepo.food(id: $0) }
            let create = EntryCreate(
                foodId: request.foodId,
                recipeId: request.recipeId,
                mealType: request.mealType,
                servings: request.servings,
                date: request.date,
                quickName: request.quickName,
                quickCalories: request.quickCalories,
                quickProtein: request.quickProtein,
                quickCarbs: request.quickCarbs,
                quickFat: request.quickFat,
                quickFiber: request.quickFiber
            )
            _ = try? await entryRepo.createEntry(create, food: food)
            return WidgetSnapshotWriter.buildSnapshot(context: context, localeCode: L10n.currentLocale.rawValue)
        }
        // Weight/sleep logs from the watch run through the same offline-first
        // repositories the UI uses; the reply carries the refreshed WatchState
        // so the watch's glance updates immediately.
        PhoneWatchConnectivity.shared.onWeightLog = { request in
            _ = try? await weightRepo.createEntry(
                WeightCreate(weightKg: request.weightKg, entryDate: request.date)
            )
            return WidgetSnapshotWriter.buildWatchState(context: context)
        }
        PhoneWatchConnectivity.shared.onSleepLog = { request in
            _ = try? await sleepRepo.createEntry(
                SleepCreate(durationMinutes: request.durationMinutes, quality: request.quality, entryDate: request.date)
            )
            return WidgetSnapshotWriter.buildWatchState(context: context)
        }
        // `activate()` is deliberately NOT called here: WCSession activation is
        // not needed before the first frame, and everything in this init runs
        // before `body` is first evaluated. It happens on the first activation
        // instead (see the `.active` branch below); the handlers above are set
        // now, so any message arriving right after activation is served.

        // A conflict means the local row lost to a newer change; pull the server
        // state so the screen stops showing the value that was dropped. Same set
        // BackgroundRefresher pulls, minus its queue drain — this runs from inside
        // the drain and would only no-op against the reentrancy guard.
        sync.onConflictResolved = { conflictDates in
            // Refresh every day a conflicted operation touched, not just today:
            // the banner tells the user their change was superseded while the
            // screen would otherwise keep showing the superseded value.
            for date in conflictDates.union([DateFormatting.today]) {
                try? await entryRepo.refresh(date: date)
            }
            try? await goalsRepo.refresh()
            try? await weightRepo.refresh()
            try? await sleepRepo.refresh()
            try? await foodRepo.refreshFavorites()
        }

        // Periodic background pull so server-side changes (MCP agent logs,
        // other devices) reach the widgets while the app is closed. Must be
        // registered before launch completes — see BackgroundRefresher.
        BackgroundRefresher.register(BackgroundRefresher.Dependencies(
            context: context,
            syncManager: sync,
            entryRepository: entryRepo,
            goalsRepository: goalsRepo,
            weightRepository: weightRepo,
            sleepRepository: sleepRepo,
            foodRepository: foodRepo,
            supplementRepository: supplementRepo
        ))

        // Supplement reminders. The category costs nothing and must be registered before
        // any request is scheduled, so it happens regardless of authorization — the
        // permission itself is only asked for when the user adds their first reminder
        // time. The delegate is assigned here rather than later because an action tap
        // that cold-launches the app is dropped if no delegate exists by the time launch
        // finishes; `UNUserNotificationCenter.delegate` is weak, hence the singleton.
        SupplementReminderScheduler.registerCategory()
        SupplementNotificationDelegate.shared.configure(repository: supplementRepo, router: router)
        UNUserNotificationCenter.current().delegate = SupplementNotificationDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            Group {
                switch resolveRootDestination(authState: authManager.authState, mode: appModeManager.mode) {
                case .login:
                    LoginView()
                case .app:
                    ContentView()
                case .migration:
                    MigrationView()
                }
            }
            .environment(authManager)
            .environment(api)
            .environment(appModeManager)
            .environment(connectivityMonitor)
            .environment(syncManager)
            .environment(migrator)
            .environment(entryRepository)
            .environment(foodRepository)
            .environment(recipeRepository)
            .environment(weightRepository)
            .environment(sleepRepository)
            .environment(supplementRepository)
            .environment(goalsRepository)
            .environment(preferencesRepository)
            .environment(deepLinkRouter)
            .environment(mealEstimator)
            .environment(fastingManager)
            .modelContainer(modelContainer)
            .onOpenURL { url in
                if let link = DeepLink.parse(url) {
                    deepLinkRouter.pending = link
                } else {
                    Task {
                        await authManager.handleCallback(url: url)
                    }
                }
            }
            // Existing installs and fresh logins that never chose a mode
            // default to Synced (mirrors the Android root).
            .onChange(of: authManager.authState, initial: true) { _, state in
                defaultModeToSyncedIfNeeded()
                syncErrorReportingUser(for: state)
                // Upload anything queued while the session was expired.
                if state == .authenticated {
                    syncManager.scheduleDrain()
                }
            }
            .onChange(of: appModeManager.mode) { _, _ in
                defaultModeToSyncedIfNeeded()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    syncManager.scheduleDrain()
                    // Pick up fasts ended from the lock screen and re-request
                    // the Live Activity if the system expired it mid-fast
                    // (~8h cap) while the fast is still running.
                    fastingManager.refresh()
                    // Covers launch, day rollover while backgrounded and any
                    // change widgets might have missed. Debounced internally.
                    WidgetSnapshotWriter.scheduleUpdate(context: modelContainer.mainContext)
                    Task { await runDeferredActivationWork() }
                } else if phase == .background {
                    // Re-arm the background pull chain for the time away.
                    BackgroundRefresher.schedule()
                }
            }
        }
    }

    /// The half of activation the frame the user is looking at doesn't need.
    ///
    /// All of it is main-actor work over the whole store — `indexCatalog`'s
    /// arguments alone are two full SwiftData reads with a JSON decode per row,
    /// and `LocalDedup.sweep` fetches four model tables — so landing it in the
    /// same run loop turn as the activation is a visible hitch on a screen
    /// whose first principle is "fast to scan, fast to act". Ordered rather
    /// than concurrent: these all contend for the same actor anyway, and each
    /// `await` gives the run loop a turn.
    @MainActor
    private func runDeferredActivationWork() async {
        // Long enough for the activation's own frames to land first.
        try? await Task.sleep(for: .milliseconds(250))

        // WCSession activation, moved off `init` — see the note there.
        PhoneWatchConnectivity.shared.activate()
        // Collapse any cross-device duplicates CloudKit delivered
        // while we were away (Local mode only — see LocalDedup).
        if appModeManager.isLocal {
            LocalDedup.sweep(in: modelContainer.mainContext)
        }
        // Keep Spotlight in step with the searchable catalog so
        // foods/recipes are findable before the next manual log.
        IntentDonations.indexCatalog(
            foods: foodRepository.favorites() + foodRepository.localRecentFoods(),
            recipes: recipeRepository.favoriteRecipes()
        )
        // Publish current Food/Recipe values for the App Shortcut phrases
        // ("Log \(food) with Bissbilanz"). Without this the system's shortcut
        // registry has no parameter values, and tapping Log Food / Log Recipe
        // in Spotlight shows an empty picker card.
        BissbilanzShortcuts.updateAppShortcutParameters()
        // Pull any new Apple Health weight/sleep data on every activation (not
        // only when those pages are visited) so it reaches the local store and
        // the queued backend upload immediately.
        await HealthKitImporter.importAllIfEnabled(
            weightRepository: weightRepository,
            sleepRepository: sleepRepository
        )
        // Top up the rolling reminder window (iOS caps pending requests at 64)
        // and re-resolve wall-clock times against the current timezone.
        await SupplementReminderScheduler.refill(repository: supplementRepository)
        // Surface any widget-extension quick-add failures (the extension has no
        // Sentry of its own — see QuickAddDiagnostics).
        for entry in QuickAddDiagnostics.drain() {
            ErrorReporter.captureWarning(
                "Quick add (widget extension): \(entry.phase)",
                context: ["details": entry.message, "timestamp": entry.timestamp.description]
            )
        }
    }

    private func defaultModeToSyncedIfNeeded() {
        let authState = authManager.authState
        if authState == .authenticated || authState == .refreshing, appModeManager.mode == nil {
            appModeManager.setMode(.synced)
        }
    }

    /// Keeps the Sentry user in step with auth (parity with Android): attach
    /// the signed-in user so issues can be told apart from a fleet-wide
    /// problem, and detach on sign-out / session expiry. Also drops a
    /// breadcrumb so the lead-up to any later error shows the auth transition.
    private func syncErrorReportingUser(for state: AuthState) {
        ErrorReporter.addBreadcrumb("auth state → \(state)", category: "auth")
        switch state {
        case .authenticated, .refreshing:
            if let id = authManager.userId {
                ErrorReporter.setUser(id: id)
            }
        case .unauthenticated, .expired:
            ErrorReporter.clearUser()
        }
    }
}
