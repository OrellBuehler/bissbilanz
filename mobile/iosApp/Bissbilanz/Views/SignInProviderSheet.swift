import AuthenticationServices
import CryptoKit
import SwiftUI

struct SignInProviderButtons: View {
    /// Shown until /api/auth/providers answers (or when it fails): the providers
    /// known to be configured in production. A failed fetch must never hide a
    /// working sign-in button.
    static let defaultEnabledProviders: Set<String> = ["infomaniak", "google"]

    let prompt: SignInPrompt

    @Environment(AuthManager.self) private var authManager
    @State private var authSession: ASWebAuthenticationSession?
    @State private var appleRawNonce = ""
    @State private var appleErrorMessage: String?
    @State private var enabledProviders = SignInProviderButtons.defaultEnabledProviders

    init(prompt: SignInPrompt = .choose) {
        self.prompt = prompt
    }

    var body: some View {
        VStack(spacing: 16) {
            ForEach(prompt.webProviders(enabled: enabledProviders)) { provider in
                providerButton(provider)
            }

            if prompt.showsApple(enabled: enabledProviders) {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                    // Apple embeds the SHA256 of this in the identity token; the raw
                    // value travels separately so the server can compare the two.
                    appleErrorMessage = nil
                    let nonce = Self.randomNonce()
                    appleRawNonce = nonce
                    request.nonce = Self.sha256(nonce)
                } onCompletion: { result in
                    handleAppleCompletion(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)

                if let appleErrorMessage {
                    Text(appleErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .task {
            guard prompt.loadsEnabledProviders else { return }
            if let providers = await authManager.fetchLoginProviders() {
                enabledProviders = Set(providers)
            }
        }
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
        if case let .failure(error) = result {
            appleRawNonce = ""
            if let appleError = error as? ASAuthorizationError {
                let failure = AppleSignInFailure.classify(appleError.code)
                guard failure != .cancelled else { return }
                appleErrorMessage = failure == .unavailable ? L10n.appleSignInUnavailable : L10n.appleSignInFailed
                // The description of these errors reaches Sentry as "[Filtered]",
                // so only the codes are sent.
                let code = (appleError as NSError).code
                guard AppleSignInFailure.shouldReport(appleError) else {
                    ErrorReporter.addBreadcrumb("Sign in with Apple unavailable", category: "auth", data: ["apple_error_code": code])
                    return
                }
                let underlying = AppleSignInFailure.underlyingError(of: appleError)
                var context: [String: Any] = [
                    "apple_error_code": code,
                    "has_underlying": underlying != nil,
                ]
                if let underlying {
                    context["underlying_code"] = underlying.code
                    context["underlying_domain"] = underlying.domain
                }
                ErrorReporter.captureWarning("Sign in with Apple failed", context: context)
            } else {
                appleErrorMessage = L10n.appleSignInFailed
                ErrorReporter.captureWarning("Sign in with Apple failed", context: ["reason": ErrorReporter.reason(for: error)])
            }
            return
        }
        guard case let .success(authorization) = result,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            appleRawNonce = ""
            appleErrorMessage = L10n.appleSignInFailed
            ErrorReporter.captureWarning("Sign in with Apple returned no identity token")
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

struct SignInProviderSheet: View {
    let prompt: SignInPrompt

    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss

    private var title: String {
        switch prompt {
        case .choose: L10n.signInChooseProvider
        case .apple: L10n.sessionExpiredTitle
        }
    }

    private var message: String {
        switch prompt {
        case .choose: L10n.signInChooseProviderHint
        case .apple: L10n.sessionExpiredMessage
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    SignInProviderButtons(prompt: prompt)
                }
                .padding(24)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onChange(of: authManager.authState) { _, state in
            if state == .authenticated { dismiss() }
        }
    }
}
