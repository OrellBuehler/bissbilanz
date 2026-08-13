import AuthenticationServices
import CryptoKit
import SwiftUI

/// Providers reached through the web flow. Apple is handled natively instead.
enum SignInProvider: String, CaseIterable, Identifiable {
    case infomaniak
    case google
    case microsoft

    var id: String { rawValue }

    var label: String {
        switch self {
        case .infomaniak: L10n.signInWithInfomaniak
        case .google: L10n.signInWithGoogle
        case .microsoft: L10n.signInWithMicrosoft
        }
    }

    var systemImage: String {
        switch self {
        case .infomaniak: "person.crop.circle"
        case .google: "globe"
        case .microsoft: "square.grid.2x2"
        }
    }
}

/// Builds, configures and starts the OIDC web sign-in session. Shared between
/// the login screen and the Settings "Sign in to sync" flow — the caller must
/// retain the returned session until the callback fires.
@MainActor
enum SignInFlow {
    static func start(
        authManager: AuthManager,
        provider: SignInProvider = .infomaniak
    ) -> ASWebAuthenticationSession? {
        guard let url = authManager.buildLoginURL(provider: provider.rawValue) else { return nil }

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
    @State private var appleRawNonce = ""
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
                ForEach(SignInProvider.allCases) { provider in
                    providerButton(provider)
                }

                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                    // Apple embeds the SHA256 of this in the identity token; the raw
                    // value travels separately so the server can compare the two.
                    let nonce = Self.randomNonce()
                    appleRawNonce = nonce
                    request.nonce = Self.sha256(nonce)
                } onCompletion: { result in
                    handleAppleCompletion(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)

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

    @ViewBuilder
    private func providerButton(_ provider: SignInProvider) -> some View {
        let button = Button {
            authSession = SignInFlow.start(authManager: authManager, provider: provider)
        } label: {
            Label(provider.label, systemImage: provider.systemImage)
                .frame(maxWidth: .infinity)
        }
        .controlSize(.large)

        if provider == .infomaniak {
            button.buttonStyle(.borderedProminent)
        } else {
            button.buttonStyle(.bordered)
        }
    }

    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        guard case let .success(authorization) = result,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            return
        }

        // Apple only sends the name on the very first authorization.
        let name = [credential.fullName?.givenName, credential.fullName?.familyName]
            .compactMap { $0 }
            .joined(separator: " ")
        let nonce = appleRawNonce
        appleRawNonce = ""

        Task {
            await authManager.signInWithApple(
                identityToken: identityToken,
                nonce: nonce,
                name: name.isEmpty ? nil : name
            )
        }
    }

    private static func randomNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

final class ASWebAuthenticationPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = ASWebAuthenticationPresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
