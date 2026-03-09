import SwiftUI

@main
struct BissbilanzApp: App {
    @StateObject private var authManager = AuthManagerWrapper()

    var body: some Scene {
        WindowGroup {
            if authManager.isAuthenticated {
                ContentView()
                    .environmentObject(authManager)
            } else {
                LoginView()
                    .environmentObject(authManager)
            }
        }
    }
}

class AuthManagerWrapper: ObservableObject {
    @Published var isAuthenticated = false

    func login() {
        // TODO: Integrate with shared KMP AuthManager
        isAuthenticated = true
    }

    func logout() {
        isAuthenticated = false
    }
}
