@testable import Bissbilanz
import Foundation
import Testing

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

    private func hang(_ seconds: Double) -> String {
        "App hanging between \(seconds) and \(seconds + 0.8) seconds."
    }
}
