import Foundation
import MetricKit
import Sentry

/// Forwards MetricKit's aggregated daily *metrics* (app launch time, hang
/// rate, memory, CPU, disk, energy) to Sentry as a single info-level event per
/// payload, tagged `source=metrickit` so it filters apart from real issues.
///
/// Crash / hang / CPU-exception / disk-write *diagnostics* are a different
/// MetricKit payload type (`MXDiagnosticPayload`) and are handled by Sentry's
/// own MetricKit integration (`options.enableMetricKit`). This subscriber
/// deliberately implements only the metric-payload callback, so the two never
/// double-report.
///
/// MetricKit aggregates on-device and delivers at most one payload per day,
/// and only on physical devices — never the simulator. The whole payload is
/// shipped as its JSON representation rather than hand-parsed histograms, so
/// new MetricKit fields show up automatically without code changes.
/// `@unchecked Sendable`: the type holds no mutable state (the shared instance
/// is its only storage), so it is safe to reach from MetricKit's background
/// delivery queue and to expose as a `static let` under Swift 6 concurrency.
final class MetricKitReporter: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    static let shared = MetricKitReporter()

    override private init() {
        super.init()
    }

    /// Subscribes to MetricKit. Safe to call once at launch.
    func start() {
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXMetricPayload]) {
        guard ErrorReporter.isEnabled else { return }
        for payload in payloads {
            report(payload)
        }
    }

    private func report(_ payload: MXMetricPayload) {
        // Pull the Sendable values out before the scope closure so the
        // non-Sendable payload isn't captured across it.
        let json = String(data: payload.jsonRepresentation(), encoding: .utf8)
        let appVersion = payload.latestApplicationVersion
        let multipleVersions = payload.includesMultipleApplicationVersions
        SentrySDK.capture(message: "MetricKit daily metrics") { scope in
            scope.setLevel(.info)
            scope.setTag(value: "metrickit", key: "source")
            scope.setContext(value: [
                "app_version": appVersion,
                "multiple_versions": multipleVersions,
            ], key: "metrickit")
            if let json {
                // Full Apple-schema payload: launch time, hang rate, memory,
                // CPU, disk I/O and energy in one blob (a few KB).
                scope.setExtra(value: json, key: "metrickit_payload")
            }
        }
    }
}
