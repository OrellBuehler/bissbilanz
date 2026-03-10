import SwiftUI

@main
struct BissbilanzApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var api: BissbilanzAPI

    init() {
        let auth = AuthManager()
        _authManager = StateObject(wrappedValue: auth)
        _api = StateObject(wrappedValue: BissbilanzAPI(authManager: auth))
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isAuthenticated {
                    ContentView()
                } else {
                    LoginView()
                }
            }
            .environmentObject(authManager)
            .environmentObject(api)
            .onOpenURL { url in
                Task {
                    await authManager.handleCallback(url: url)
                }
            }
        }
    }
}
