import Foundation
import UserNotifications

/// Handles taps and action buttons on supplement reminders.
///
/// A retained `NSObject` singleton rather than an `@UIApplicationDelegateAdaptor`:
/// `UNUserNotificationCenter.delegate` is a **weak** reference, so a locally-scoped
/// delegate would be deallocated and silently stop receiving callbacks — the classic bug
/// here. It's assigned in `BissbilanzApp.init` because the delegate must exist before
/// launch completes, or an action tap that cold-launches the app is dropped (the same
/// constraint `BackgroundRefresher.register` documents).
@MainActor
final class SupplementNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = SupplementNotificationDelegate()

    private var repository: SupplementRepository?
    private var router: DeepLinkRouter?

    func configure(repository: SupplementRepository, router: DeepLinkRouter) {
        self.repository = repository
        self.router = router
    }

    /// Show reminders that fire while the app is open — otherwise a user watching the
    /// screen at 08:00 concludes reminders are broken.
    func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification
    ) async -> UNNotificationPresentationOptions {
        if let repository {
            await SupplementReminderScheduler.refill(repository: repository)
        }
        return [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        let supplementId = userInfo[SupplementReminderScheduler.userInfoSupplementId] as? String

        switch response.actionIdentifier {
        case SupplementReminderScheduler.takenAction:
            if let supplementId, let repository {
                // Optimistic local write plus a queued upload, no network — which is what
                // makes this safe inside a background action's short execution budget.
                // Going through the repository is also what puts an offline tap in the
                // sync queue; the server's partial unique index makes a redelivered log
                // idempotent. `logSupplement` cancels today's remaining reminders itself.
                try? await repository.logSupplement(id: supplementId, date: DateFormatting.today)
            }

        case SupplementReminderScheduler.snoozeAction:
            await SupplementReminderScheduler.snooze(response.notification)

        case SupplementReminderScheduler.skipAction:
            if let supplementId {
                SupplementReminderSkips.markSkipped(supplementId: supplementId)
                await SupplementReminderScheduler.cancelToday(supplementId: supplementId)
            }

        case UNNotificationDefaultActionIdentifier:
            router?.pending = .supplements

        default:
            break
        }

        // A notification interaction is one of the few reliable chances to run, so top the
        // rolling window back up while we have it.
        if let repository {
            await SupplementReminderScheduler.refill(repository: repository)
        }
    }
}
