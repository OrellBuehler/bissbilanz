import SwiftData
import SwiftUI

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
    @State private var deepLinkRouter = DeepLinkRouter()
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
            onError: { ErrorReporter.capture($0) }
        )
        modelContainer = container
        // One-time: drop persistent history orphaned by moving the sync queue
        // into its own store, which otherwise crashes CoreData on the next save.
        LocalStore.purgeStaleHistoryIfNeeded(container)
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
        _entryRepository = State(wrappedValue: EntryRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _foodRepository = State(wrappedValue: FoodRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _recipeRepository = State(wrappedValue: RecipeRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _weightRepository = State(wrappedValue: WeightRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _sleepRepository = State(wrappedValue: SleepRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _supplementRepository = State(wrappedValue: SupplementRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _goalsRepository = State(wrappedValue: GoalsRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
        _preferencesRepository = State(wrappedValue: PreferencesRepository(
            context: context, api: api, appMode: appMode, syncManager: sync
        ))
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
                    // Collapse any cross-device duplicates CloudKit delivered
                    // while we were away (Local mode only — see LocalDedup).
                    if appModeManager.isLocal {
                        LocalDedup.sweep(in: modelContainer.mainContext)
                    }
                    // Covers launch, day rollover while backgrounded and any
                    // change widgets might have missed.
                    WidgetSnapshotWriter.scheduleUpdate(context: modelContainer.mainContext)
                }
            }
        }
    }

    private func defaultModeToSyncedIfNeeded() {
        let authState = authManager.authState
        if authState == .authenticated || authState == .refreshing, appModeManager.mode == nil {
            appModeManager.setMode(.synced)
        }
    }
}
