import AuthenticationServices
import SwiftUI

/// Builds, configures and starts the OIDC web sign-in session. Shared between
/// the login screen and the Settings "Sign in to sync" flow — the caller must
/// retain the returned session until the callback fires.
@MainActor
enum SignInFlow {
    static func start(authManager: AuthManager) -> ASWebAuthenticationSession? {
        guard let url = authManager.buildLoginURL() else { return nil }

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
        session.start()
        return session
    }
}

struct LoginView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(AppModeManager.self) private var appModeManager
    @State private var authSession: ASWebAuthenticationSession?
    @ScaledMetric(relativeTo: .largeTitle) private var brandIconSize = 72.0

    var body: some View {
        VStack(spacing: 48) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "leaf.circle.fill")
                    .font(.system(size: brandIconSize))
                    .foregroundStyle(MacroColors.calories)

                Text(L10n.appName)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(MacroColors.calories)

                Text(L10n.trackNutrition)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 16) {
                Button {
                    authSession = SignInFlow.start(authManager: authManager)
                } label: {
                    Label(L10n.signIn, systemImage: "person.crop.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                VStack(spacing: 8) {
                    Button {
                        appModeManager.setMode(.local)
                    } label: {
                        Text(L10n.continueWithoutAccount)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

                    Text(L10n.localModeExplainer)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            Spacer()
        }
        .padding(32)
    }
}

final class ASWebAuthenticationPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = ASWebAuthenticationPresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
