import Foundation
import UserNotifications

/// The Sendable slice of a delivered reminder that the main actor actually needs.
///
/// `UNNotificationResponse` and its content are not Sendable, so nothing from the
/// notification itself can cross an isolation boundary — the delegate pulls out these
/// plain values first and hands those over instead.
struct SupplementReminderPayload {
    let supplementId: String?
    let title: String
    let body: String
}

/// Handles taps and action buttons on supplement reminders.
///
/// A retained `NSObject` singleton rather than an `@UIApplicationDelegateAdaptor`:
/// `UNUserNotificationCenter.delegate` is a **weak** reference, so a locally-scoped
/// delegate would be deallocated and silently stop receiving callbacks — the classic bug
/// here. It's assigned in `BissbilanzApp.init` because the delegate must exist before
/// launch completes, or an action tap that cold-launches the app is dropped (the same
/// constraint `BackgroundRefresher.register` documents).
///
/// The protocol's methods are called from an arbitrary context with non-Sendable
/// arguments, so they are `nonisolated` and hop to the main actor themselves. All mutable
/// state is `@MainActor`-isolated, which is what makes the `@unchecked Sendable`
/// conformance sound.
///
/// The **completion-handler** protocol variants are implemented deliberately, not the
/// `async` ones: the compiler thunk for an async delegate method invokes the framework's
/// completion on the Swift concurrency executor (a background thread), and UIKit's
/// post-response snapshot/state-restoration work then runs there and crashes with
/// `NSInternalInconsistencyException: Call must be made on main thread` (BISSBILANZ-2N,
/// notification tap on cold launch). Invoking the handler from the main actor keeps that
/// follow-up work on the main thread.
final class SupplementNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = SupplementNotificationDelegate()

    @MainActor private var repository: SupplementRepository?
    @MainActor private var router: DeepLinkRouter?

    @MainActor
    func configure(repository: SupplementRepository, router: DeepLinkRouter) {
        self.repository = repository
        self.router = router
    }

    /// Show reminders that fire while the app is open — otherwise a user watching the
    /// screen at 08:00 concludes reminders are broken.
    nonisolated func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let completion = UncheckedSendable(completionHandler)
        Task { @MainActor in
            await refill()
            completion.value([.banner, .sound, .list])
        }
    }

    nonisolated func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let content = response.notification.request.content
        let payload = SupplementReminderPayload(
            supplementId: content.userInfo[SupplementReminderScheduler.userInfoSupplementId] as? String,
            title: content.title,
            body: content.body
        )
        let action = response.actionIdentifier
        let completion = UncheckedSendable(completionHandler)
        Task { @MainActor in
            await handle(action: action, payload: payload)
            // A notification interaction is one of the few reliable chances to run, so top the
            // rolling window back up while we have it.
            await refill()
            completion.value()
        }
    }

    @MainActor
    private func handle(action: String, payload: SupplementReminderPayload) async {
        switch action {
        case SupplementReminderScheduler.takenAction:
            if let supplementId = payload.supplementId, let repository {
                // Optimistic local write plus a queued upload, no network — which is what
                // makes this safe inside a background action's short execution budget.
                // Going through the repository is also what puts an offline tap in the
                // sync queue; the server's partial unique index makes a redelivered log
                // idempotent. `logSupplement` cancels today's remaining reminders itself.
                try? await repository.logSupplement(id: supplementId, date: DateFormatting.today)
            }

        case SupplementReminderScheduler.snoozeAction:
            SupplementReminderScheduler.snooze(payload)

        case SupplementReminderScheduler.skipAction:
            if let supplementId = payload.supplementId {
                SupplementReminderSkips.markSkipped(supplementId: supplementId)
                await SupplementReminderScheduler.cancelToday(supplementId: supplementId)
            }

        case UNNotificationDefaultActionIdentifier:
            router?.pending = .supplements

        default:
            break
        }
    }

    @MainActor
    private func refill() async {
        guard let repository else { return }
        await SupplementReminderScheduler.refill(repository: repository)
    }
}

/// Wraps a value the compiler can't prove `Sendable` (here, the framework's completion
/// closure) so it can cross into a `@Sendable` task. Safe because the wrapped closure is
/// only ever invoked once, from the main actor — which is the whole point (see the class
/// doc). Same pattern as `PhoneWatchConnectivity`'s private wrapper.
private struct UncheckedSendable<Value>: @unchecked Sendable {
    let value: Value
    init(_ value: Value) {
        self.value = value
    }
}
