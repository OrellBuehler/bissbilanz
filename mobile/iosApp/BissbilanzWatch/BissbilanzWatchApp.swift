import SwiftUI

@main
struct BissbilanzWatchApp: App {
    @State private var connectivity = WatchConnectivityManager()

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(connectivity)
                .task { connectivity.activate() }
        }
    }
}
