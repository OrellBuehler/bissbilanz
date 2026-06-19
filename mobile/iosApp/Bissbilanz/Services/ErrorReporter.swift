import Foundation
import Sentry

/// Central Sentry wrapper — the iOS counterpart of the Android app's
/// `SentryErrorReporter`. Crashes and unhandled errors are captured by the
/// SDK's crash handler; handled errors funnel through `capture(_:context:)`,
/// which applies the same noise filtering as Android:
/// - auth failures are an expected state (session expired), not a defect
/// - transient network failures (offline, flaky cellular) are not actionable
///
/// Beyond crashes, the wrapper also feeds Sentry:
/// - the signed-in user (`setUser`/`clearUser`), so issues can be told apart
///   from "everyone is hitting this" — parity with Android's `Sentry.setUser`
/// - breadcrumbs (`addBreadcrumb`), a trail of recent actions shipped with the
///   next event so a crash report shows what led up to it
/// - structured context on handled errors (HTTP endpoint, status, response
///   body), so an API failure carries enough to debug without a repro
/// - MetricKit diagnostics (hangs, CPU/disk exceptions) via the SDK's own
///   integration, plus daily aggregate metrics via `MetricKitReporter`
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
            // App-hang (ANR) detection — surfaces a stuck main thread with the
            // blocking stacktrace. On by default; set explicitly so it can't be
            // lost to a future default change.
            options.enableAppHangTracking = true
            // Let Sentry ingest MetricKit *diagnostics* — OS-sampled crashes,
            // hangs, CPU and disk-write exceptions — as events with stack
            // traces. Aggregate *metrics* (launch time, energy) are handled
            // separately by `MetricKitReporter` (MetricKit splits the two).
            options.enableMetricKit = true
            #if DEBUG
            options.environment = "development"
            #else
            options.environment = "production"
            #endif
        }

        // Forward MetricKit's daily aggregate metrics (launch, hang rate,
        // memory, energy) — device-only, at most one payload per day.
        MetricKitReporter.shared.start()
    }

    /// Associates subsequent events with a user id (the OIDC `sub`), so Sentry
    /// can group an issue by how many distinct users it hits. Mirrors Android's
    /// `Sentry.setUser`. No-op when Sentry is disabled.
    static func setUser(id: String) {
        guard isEnabled else { return }
        let user = User()
        user.userId = id
        SentrySDK.setUser(user)
    }

    /// Detaches the user on sign-out / session expiry, so events from a
    /// shared-device "logged out" state aren't misattributed.
    static func clearUser() {
        guard isEnabled else { return }
        SentrySDK.setUser(nil)
    }

    /// Records a breadcrumb — a timestamped trail entry that ships with the
    /// next captured event. Use it for high-signal milestones (a request
    /// issued, a sync started, the auth state changing) so a later crash or
    /// error report shows the lead-up. No-op when Sentry is disabled.
    static func addBreadcrumb(
        _ message: String,
        category: String,
        level: SentryLevel = .info,
        data: [String: Any]? = nil
    ) {
        guard isEnabled else { return }
        let crumb = Breadcrumb(level: level, category: category)
        crumb.message = message
        if let data {
            crumb.data = data
        }
        SentrySDK.addBreadcrumb(crumb)
    }

    /// Reports a handled error, unless it is expected noise. `context` is
    /// attached to the event under the "details" context block — pass whatever
    /// helps debugging without a repro (endpoint, status code, ids).
    static func capture(_ error: Error, context: [String: Any]? = nil) {
        guard isEnabled, !shouldIgnore(error) else { return }
        SentrySDK.capture(error: error) { scope in
            if let context {
                scope.setContext(value: context, key: "details")
            }
        }
    }

    /// Reports a non-fatal warning: a recoverable problem still worth knowing
    /// about (a sync conflict resolved by discarding local state, a fallback
    /// that masked a server bug). Sent at `warning` level with optional
    /// structured context.
    static func captureWarning(_ message: String, context: [String: Any]? = nil) {
        guard isEnabled else { return }
        SentrySDK.capture(message: message) { scope in
            scope.setLevel(.warning)
            if let context {
                scope.setContext(value: context, key: "details")
            }
        }
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
