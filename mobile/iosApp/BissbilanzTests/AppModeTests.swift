@testable import Bissbilanz
import Foundation
import Testing

@Suite("App mode manager")
@MainActor
struct AppModeManagerTests {
    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "appmode-test-\(UUID().uuidString)")!
    }

    @Test("Starts with no mode chosen")
    func startsWithNilMode() {
        let manager = AppModeManager(defaults: makeDefaults())
        #expect(manager.mode == nil)
        #expect(manager.isLocal == false)
    }

    @Test("setMode persists across instances")
    func setModePersists() {
        let defaults = makeDefaults()
        AppModeManager(defaults: defaults).setMode(.local)

        let reloaded = AppModeManager(defaults: defaults)
        #expect(reloaded.mode == .local)
        #expect(reloaded.isLocal == true)
    }

    @Test("Switching to synced persists too")
    func switchingToSyncedPersists() {
        let defaults = makeDefaults()
        let manager = AppModeManager(defaults: defaults)
        manager.setMode(.local)
        manager.setMode(.synced)

        #expect(manager.isLocal == false)
        #expect(AppModeManager(defaults: defaults).mode == .synced)
    }

    @Test("clear removes the persisted mode")
    func clearRemovesMode() {
        let defaults = makeDefaults()
        let manager = AppModeManager(defaults: defaults)
        manager.setMode(.local)
        manager.clear()

        #expect(manager.mode == nil)
        #expect(AppModeManager(defaults: defaults).mode == nil)
    }

    @Test("Garbage in the store reads as no mode")
    func garbageReadsAsNil() {
        let defaults = makeDefaults()
        defaults.set("bogus", forKey: "app_mode")
        #expect(AppModeManager(defaults: defaults).mode == nil)
    }
}

@Suite("Root destination routing")
struct RootDestinationTests {
    @Test(
        "Routing table",
        arguments: [
            // Local mode is fully anonymous: the app shows without an account,
            // and a successful login first migrates the local data.
            (AuthState.unauthenticated, AppMode.local, RootDestination.app),
            (AuthState.authenticated, AppMode.local, RootDestination.migration),
            (AuthState.refreshing, AppMode.local, RootDestination.migration),
            // Synced (and "not chosen" nil) requires an account.
            (AuthState.unauthenticated, AppMode.synced, RootDestination.login),
            (AuthState.authenticated, AppMode.synced, RootDestination.app),
            (AuthState.refreshing, AppMode.synced, RootDestination.app),
        ]
    )
    func routes(authState: AuthState, mode: AppMode, expected: RootDestination) {
        #expect(resolveRootDestination(authState: authState, mode: mode) == expected)
    }

    @Test(
        "nil mode (not chosen) is treated as sync-allowed",
        arguments: [
            (AuthState.unauthenticated, RootDestination.login),
            (AuthState.authenticated, RootDestination.app),
            (AuthState.refreshing, RootDestination.app),
        ]
    )
    func nilModeRoutes(authState: AuthState, expected: RootDestination) {
        #expect(resolveRootDestination(authState: authState, mode: nil) == expected)
    }
}
