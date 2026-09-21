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

    @Test("Fatal hang whose main thread idles in the run loop is a suspension kill")
    func dropsIdleRunLoopFatalHang() {
        let idle = [
            "start", "main", "BissbilanzApp.$main", "UIApplicationMain",
            "-[UIApplication _run]", "GSEventRunModal", "_CFRunLoopRunSpecificWithOptions",
            "__CFRunLoopRun", "__CFRunLoopServiceMachPort", "mach_msg", "mach_msg_overwrite",
            "mach_msg2_internal", "mach_msg2_trap",
        ]
        #expect(ErrorReporter.isIdleRunLoopStack(idle))
    }

    @Test("Fatal hang blocked in real work is kept")
    func keepsBlockedFatalHang() {
        let keychain = [
            "swift::runJobInEstablishedExecutorContext", "SecItemUpdate",
            "xpc_connection_send_message_with_reply_sync", "mach_msg", "mach_msg2_trap",
        ]
        #expect(!ErrorReporter.isIdleRunLoopStack(keychain))
        let coreData = [
            "BissbilanzApp.$main", "__CFRunLoopRun", "__CFRunLoopServiceMachPort",
            "SleepRepository.save", "-[NSManagedObjectContext performBlockAndWait:]",
        ]
        #expect(!ErrorReporter.isIdleRunLoopStack(coreData))
        #expect(!ErrorReporter.isIdleRunLoopStack([]))
        #expect(!ErrorReporter.isIdleRunLoopStack(["mach_msg2_trap"]))
    }

    private func hang(_ seconds: Double) -> String {
        "App hanging between \(seconds) and \(seconds + 0.8) seconds."
    }
}
