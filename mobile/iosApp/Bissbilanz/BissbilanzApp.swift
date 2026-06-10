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
/// - A `nil` mode means "not chosen yet" and is treated as sync-allowed
///   (existing installs and fresh logins).
func resolveRootDestination(authState: AuthState, mode: AppMode?) -> RootDestination {
    switch authState {
    case .authenticated, .refreshing:
        mode == .local ? .migration : .app
    case .unauthenticated:
        mode == .local ? .app : .login
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
    @State private var supplementRepository: SupplementRepository
    @State private var goalsRepository: GoalsRepository
    @State private var preferencesRepository: PreferencesRepository
    private let modelContainer: ModelContainer

    init() {
        let auth = AuthManager()
        let api = BissbilanzAPI(authManager: auth)
        let appMode = AppModeManager()
        let connectivity = ConnectivityMonitor()
        connectivity.start()

        let container: ModelContainer
        do {
            container = try LocalStore.makeContainer()
        } catch {
            // The on-disk store is unusable (e.g. failed migration). Fall back
            // to an in-memory store rather than crashing — data refreshes from
            // the API while the app is online.
            do {
                container = try LocalStore.makeContainer(inMemory: true)
            } catch {
                fatalError("Failed to create SwiftData container: \(error)")
            }
        }
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
            .environment(supplementRepository)
            .environment(goalsRepository)
            .environment(preferencesRepository)
            .modelContainer(modelContainer)
            .onOpenURL { url in
                Task {
                    await authManager.handleCallback(url: url)
                }
            }
            // Existing installs and fresh logins that never chose a mode
            // default to Synced (mirrors the Android root).
            .onChange(of: authManager.authState, initial: true) { _, _ in
                defaultModeToSyncedIfNeeded()
            }
            .onChange(of: appModeManager.mode) { _, _ in
                defaultModeToSyncedIfNeeded()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    syncManager.scheduleDrain()
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
