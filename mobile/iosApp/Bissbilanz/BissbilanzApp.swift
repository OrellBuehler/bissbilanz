import SwiftUI

@main
struct BissbilanzApp: App {
    @State private var authManager = AuthManager()
    @State private var api: BissbilanzAPI

    init() {
        let auth = AuthManager()
        _authManager = State(wrappedValue: auth)
        _api = State(wrappedValue: BissbilanzAPI(authManager: auth))
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
            .environment(authManager)
            .environment(api)
            .onOpenURL { url in
                Task {
                    await authManager.handleCallback(url: url)
                }
            }
        }
    }
}
