import SwiftUI

@main
struct BissbilanzWatchApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var connectivity = WatchConnectivityManager()
    @State private var mealEstimator = WatchMealEstimator()

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(connectivity)
                .environment(mealEstimator)
                .task { connectivity.activate() }
                .onChange(of: scenePhase) { _, phase in
                    // Covers a wrist raise onto an app that has been sitting in
                    // the background since before the phone's last write. The
                    // launch case is handled from the activation callback, where
                    // the session is guaranteed to be up; `requestState()`
                    // throttles the two against each other.
                    if phase == .active {
                        connectivity.refreshPendingLogs()
                        connectivity.requestState()
                    }
                }
        }
    }
}
