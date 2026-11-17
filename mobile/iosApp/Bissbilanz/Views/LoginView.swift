import AuthenticationServices
import SwiftUI

/// Providers reached through the web flow. Apple is handled natively instead.
enum SignInProvider: String, CaseIterable, Identifiable {
    case infomaniak
    case google

    var id: String { rawValue }

    var label: String {
        switch self {
        case .infomaniak: L10n.signInWithInfomaniak
        case .google: L10n.signInWithGoogle
        }
    }

    var systemImage: String {
        switch self {
        case .infomaniak: "person.crop.circle"
        case .google: "globe"
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

/// How the login screen treats a failed native Sign in with Apple request.
enum AppleSignInFailure: Equatable {
    /// The user dismissed the sheet: nothing to show or report.
    case cancelled
    /// `.unknown` (1000) or `.notInteractive`: what a device without a signed-in
    /// Apple Account reports. The user is pointed at the other sign-in options.
    case unavailable
    case failed

    static func classify(_ code: ASAuthorizationError.Code) -> AppleSignInFailure {
        switch code {
        case .canceled: .cancelled
        case .unknown, .notInteractive: .unavailable
        default: .failed
        }
    }

    static func underlyingError(of error: ASAuthorizationError) -> NSError? {
        (error as NSError).userInfo[NSUnderlyingErrorKey] as? NSError
    }

    /// A bare `.unknown` with no underlying error is the expected result on a
    /// device without an Apple Account (App Review's devices hit it on every
    /// submission, BISSBILANZ-3M), so it only leaves a breadcrumb.
    static func shouldReport(_ error: ASAuthorizationError) -> Bool {
        switch classify(error.code) {
        case .cancelled: false
        case .unavailable: error.code != .unknown || underlyingError(of: error) != nil
        case .failed: true
        }
    }
}

struct LoginView: View {
    @Environment(AppModeManager.self) private var appModeManager
    @ScaledMetric(relativeTo: .largeTitle) private var brandIconSize = 72.0

    var body: some View {
        VStack(spacing: 48) {
            Spacer()

            VStack(spacing: 12) {
                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: brandIconSize, height: brandIconSize)
                    .clipShape(RoundedRectangle(cornerRadius: brandIconSize * 0.22, style: .continuous))
                    .accessibilityHidden(true)

                Text(L10n.appName)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(MacroColors.calories)

                Text(L10n.trackNutrition)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 16) {
                SignInProviderButtons()

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
