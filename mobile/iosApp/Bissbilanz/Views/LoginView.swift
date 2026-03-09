import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManagerWrapper

    var body: some View {
        VStack(spacing: 48) {
            Spacer()

            VStack(spacing: 8) {
                Text("Bissbilanz")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.blue)

                Text("Track your nutrition")
                    .font(.body)
                    .foregroundColor(.secondary)
            }

            Button("Sign in") {
                // TODO: Launch OAuth PKCE flow via system browser
                authManager.login()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer()
        }
        .padding(32)
    }
}
