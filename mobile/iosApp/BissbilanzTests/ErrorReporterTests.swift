@testable import Bissbilanz
import Foundation
import Testing

@Suite("Expected Failure Reason Tests")
struct ExpectedFailureReasonTests {
    @Test("Device and session failures are expected")
    func expectedReasons() {
        for reason in ["unauthorized", "offline", "timeout", "cannot_reach_host", "cancelled"] {
            #expect(ErrorReporter.isExpectedFailureReason(reason))
        }
    }

    @Test("Server, decoding and unclassified failures are still reported")
    func reportedReasons() {
        let reasons = [
            "server_error_500", "server_error_502", "decoding_error_200", "other: boom", "url_error_-1200", "conflict",
        ]
        for reason in reasons {
            #expect(!ErrorReporter.isExpectedFailureReason(reason))
        }
    }

    @Test("Reasons produced by reason(for:) line up with the expected set")
    func reasonsFromErrors() {
        #expect(ErrorReporter.isExpectedFailureReason(ErrorReporter.reason(for: URLError(.notConnectedToInternet))))
        #expect(ErrorReporter.isExpectedFailureReason(ErrorReporter.reason(for: URLError(.timedOut))))
        #expect(ErrorReporter.isExpectedFailureReason(ErrorReporter.reason(for: URLError(.cannotConnectToHost))))
        #expect(ErrorReporter.isExpectedFailureReason(ErrorReporter.reason(for: CancellationError())))
        #expect(ErrorReporter.isExpectedFailureReason(ErrorReporter.reason(for: APIError.unauthorized)))
        #expect(!ErrorReporter.isExpectedFailureReason(ErrorReporter.reason(for: APIError.serverError(500, "boom"))))
    }
}

@Suite("App Hang Filtering Tests")
struct AppHangFilteringTests {
    @Test("Reads the lower bound out of a hang duration")
    func parsesHangDuration() {
        #expect(
            ErrorReporter.reportedHangSeconds(
                in: "App hanging between 53799.2 and 53800.0 seconds."
            ) == 53799.2
        )
        #expect(
            ErrorReporter.reportedHangSeconds(in: "App hanging between 2.7 and 3.5 seconds.") == 2.7
        )
    }

    @Test("Fatal hangs carry no duration and are kept")
    func fatalHangHasNoDuration() {
        let fatal = "The user or the OS watchdog terminated your app while it blocked the main thread for at least 2000 ms."
        #expect(ErrorReporter.reportedHangSeconds(in: fatal) == nil)
        #expect(!ErrorReporter.isSuspensionArtifactHang(hangDescription: fatal))
    }

    @Test("Only implausibly long hangs are dropped")
    func dropsSuspensionArtifacts() {
        #expect(ErrorReporter.isSuspensionArtifactHang(hangDescription: hang(53799.2)))
        #expect(ErrorReporter.isSuspensionArtifactHang(hangDescription: hang(5191.1)))
        #expect(!ErrorReporter.isSuspensionArtifactHang(hangDescription: hang(2.7)))
        #expect(!ErrorReporter.isSuspensionArtifactHang(hangDescription: hang(19.0)))
    }

    @Test("A trail without a foreground or active crumb is a background launch")
    func dropsBackgroundLaunchHangs() {
        #expect(hasNoForegroundPhase([], count: 0))
        #expect(hasNoForegroundPhase([]))
        #expect(hasNoForegroundPhase(["inactive", "background"]))
    }

    @Test("A foreground or active crumb keeps the hang")
    func keepsForegroundHangs() {
        #expect(!hasNoForegroundPhase(["active"]))
        #expect(!hasNoForegroundPhase(["foreground", "active", "background"]))
    }

    @Test("A full trail may have evicted the lifecycle crumb, so the hang is kept")
    func keepsHangsWithAFullTrail() {
        #expect(hasNoForegroundPhase([], count: 99))
        #expect(!hasNoForegroundPhase([], count: 100))
    }

    private func hasNoForegroundPhase(_ states: [String], count: Int = 40) -> Bool {
        ErrorReporter.hasNoForegroundPhase(lifecycleStates: states, breadcrumbCount: count, maxBreadcrumbs: 100)
    }

    private func hang(_ seconds: Double) -> String {
        "App hanging between \(seconds) and \(seconds + 0.8) seconds."
    }
}
