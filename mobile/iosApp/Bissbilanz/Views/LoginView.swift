import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var authSession: ASWebAuthenticationSession?

    var body: some View {
        VStack(spacing: 48) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "leaf.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(MacroColors.calories)

                Text(L10n.appName)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(MacroColors.calories)

                Text(L10n.trackNutrition)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            Button {
                signIn()
            } label: {
                Label(L10n.signIn, systemImage: "person.crop.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer()
        }
        .padding(32)
    }

    private func signIn() {
        guard let url = authManager.buildAuthorizationURL() else { return }

        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "bissbilanz"
        ) { callbackURL, error in
            guard let callbackURL, error == nil else { return }
            Task {
                await authManager.handleCallback(url: callbackURL)
            }
        }
        session.prefersEphemeralWebBrowserSession = false
        session.presentationContextProvider = ASWebAuthenticationPresentationContextProvider.shared
        authSession = session
        session.start()
    }
}

final class ASWebAuthenticationPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = ASWebAuthenticationPresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
