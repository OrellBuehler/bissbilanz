import Foundation
import Sentry

/// Central Sentry wrapper — the iOS counterpart of the Android app's
/// `SentryErrorReporter`. Crashes and unhandled errors are captured by the
/// SDK's crash handler; handled errors funnel through `capture(_:)`, which
/// applies the same noise filtering as Android:
/// - auth failures are an expected state (session expired), not a defect
/// - transient network failures (offline, flaky cellular) are not actionable
///
/// The DSN is injected at build time via the `SENTRY_DSN` build setting
/// (surfaced in Info.plist as `SentryDSN`). When it is empty — every local
/// and CI debug build — Sentry stays completely disabled.
enum ErrorReporter {
    /// Whether the Sentry SDK was started with a DSN.
    static var isEnabled: Bool {
        SentrySDK.isEnabled
    }

    /// Starts Sentry if a DSN was baked into the build. Must run before any
    /// `capture(_:)` call — the app calls it first thing in its initializer.
    static func start() {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SentryDSN") as? String,
              !dsn.isEmpty
        else {
            return
        }
        SentrySDK.start { options in
            options.dsn = dsn
            options.attachScreenshot = true
            options.attachViewHierarchy = true
            options.tracesSampleRate = 0.2
            #if DEBUG
            options.environment = "development"
            #else
            options.environment = "production"
            #endif
        }
    }

    /// Reports a handled error, unless it is expected noise.
    static func capture(_ error: Error) {
        guard isEnabled, !shouldIgnore(error) else { return }
        SentrySDK.capture(error: error)
    }

    /// Sends a message event to verify the pipeline end-to-end (debug builds
    /// expose this from the settings screen).
    static func sendTestEvent() {
        SentrySDK.capture(message: "Bissbilanz iOS test event")
    }

    private static func shouldIgnore(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }
        // Plain connectivity failures outside the API layer.
        if error is URLError {
            return true
        }
        switch error as? APIError {
        case .unauthorized:
            // Session is dead — the UI prompts to sign in again.
            return true
        case .networkError:
            // Offline, timeout, DNS hiccup — mirrors Android's IOException filter.
            return true
        case .notFound:
            // Lookups (barcode, latest weight) legitimately miss.
            return true
        case .badRequest, .serverError, .decodingError, nil:
            return false
        }
    }
}
