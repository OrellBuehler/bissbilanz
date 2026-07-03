import ActivityKit
import Foundation

/// Attributes for the fasting Live Activity (lock screen + Dynamic Island).
/// Everything the views render lives in `ContentState` — including
/// `startDate`, which is conceptually static — so a target change mid-fast
/// updates every surface through a single `Activity.update`. The timers count
/// on-device via `Text(timerInterval:)`/`ProgressView(timerInterval:)`; no
/// push updates are involved (`pushType: nil`).
struct FastingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startDate: Date
        var targetEndDate: Date

        /// See `FastingSession.elapsedRange` — the elapsed timer keeps
        /// counting past the target, so its bound is a far-out cap.
        var elapsedRange: ClosedRange<Date> {
            startDate ... startDate.addingTimeInterval(7 * 24 * 3600)
        }

        var progressRange: ClosedRange<Date> {
            startDate ... max(targetEndDate, startDate.addingTimeInterval(60))
        }

        var targetHours: Int {
            Int((targetEndDate.timeIntervalSince(startDate) / 3600).rounded())
        }
    }

    var startDate: Date
    var targetHours: Int
}
