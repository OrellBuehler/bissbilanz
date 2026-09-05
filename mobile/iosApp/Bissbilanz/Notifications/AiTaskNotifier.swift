import Foundation
import UserNotifications

/// Tells the user the assistant gave up on a meal they sent it.
///
/// A dismissal is the only AI task outcome worth interrupting for: a completion speaks
/// for itself as new diary entries, whereas a dismissal means the meal was never logged.
///
/// Unlike supplement reminders these fire immediately (a 1s interval trigger, the
/// shortest the framework allows) rather than being scheduled ahead, so they barely
/// touch the system's 64-slot pending budget — but a burst is still capped.
enum AiTaskNotifier {
    static let categoryIdentifier = "AI_TASK_DISMISSED"
    static let identifierPrefix = "aitask-"
    static let userInfoTaskId = "aiTaskId"

    /// Never register a category for this: it has no actions, and
    /// `setNotificationCategories` replaces the whole set, so adding one would mean
    /// touching the supplement reminder's registration for no gain. An unregistered
    /// identifier still reaches the delegate on the content, which is all we read.
    private static let burstCap = 10

    /// Ids already announced on this device, tracked in one array-valued default rather
    /// than found by scanning: `dictionaryRepresentation()` materialises every key in
    /// every domain in the search list, and this runs on every foreground and every
    /// background refresh.
    private static let notifiedKey = "ai_task_notified_ids"
    /// Enough to cover the server's 30-day retention without unbounded growth.
    private static let notifiedCap = 200

    /// Posts one notification per dismissal this device has not announced yet.
    ///
    /// Server-side acknowledgement is what clears the badge, and that only happens when
    /// the user opens the list — so without this local record every refresh in between
    /// would re-raise the same notification.
    /// Asks for notification permission at the moment of intent — when the user opens
    /// the AI Tasks list. Without this the feature is silent for anyone who never added
    /// a supplement reminder, which is the only other place the app asks.
    @discardableResult
    static func requestAuthorizationIfNeeded() async -> Bool {
        await SupplementReminderScheduler.requestAuthorizationIfNeeded()
    }

    static func notifyNewDismissals(_ tasks: [AiTask]) async {
        let unread = tasks.filter(\.isUnreadDismissal)
        guard !unread.isEmpty else {
            prune(knownIds: Set(tasks.map(\.id)))
            return
        }
        guard await SupplementReminderScheduler.authorizationStatus() == .authorized else { return }

        var notified = storedNotifiedIds()
        let fresh = unread.filter { !notified.contains($0.id) }.prefix(burstCap)
        guard !fresh.isEmpty else {
            prune(knownIds: Set(tasks.map(\.id)))
            return
        }

        for task in fresh {
            let content = UNMutableNotificationContent()
            content.title = L10n.aiTaskDismissedTitle
            let summary = task.resultSummary.flatMap { $0.isEmpty ? nil : $0 }
            content.body = summary ?? L10n.aiTaskDismissedBodyFallback
            content.sound = .default
            content.categoryIdentifier = categoryIdentifier
            content.userInfo = [userInfoTaskId: task.id]

            let request = UNNotificationRequest(
                identifier: "\(identifierPrefix)\(task.id)",
                content: content,
                // Must be > 0; this is "as soon as possible".
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            )
            // The completion-handler form: `add(_:)`'s async form would send a
            // non-Sendable UNNotificationRequest across an isolation boundary.
            UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
            notified.append(task.id)
        }

        store(notified, knownIds: Set(tasks.map(\.id)))
    }

    /// The meal never reached the server after every retry. Fires only when the
    /// user is not looking at the app — in the foreground the list shows the
    /// failed upload itself.
    static func notifyUploadFailed(description: String?) async {
        guard await SupplementReminderScheduler.authorizationStatus() == .authorized else { return }
        let content = UNMutableNotificationContent()
        content.title = L10n.aiTaskUploadFailedTitle
        content.body = description.flatMap { $0.isEmpty ? nil : $0 } ?? L10n.aiTaskUploadFailedBody
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        let request = UNNotificationRequest(
            identifier: "\(identifierPrefix)upload-failed-\(UUID().uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    private static func prune(knownIds: Set<String>) {
        store(storedNotifiedIds(), knownIds: knownIds)
    }

    /// Drops ids the server no longer returns so the list cannot grow without bound as
    /// resolved tasks are cleaned up after 30 days.
    ///
    /// Pruning is skipped when `knownIds` is empty: a failed or not-yet-run refresh
    /// looks identical to "no tasks exist", and pruning against that would clear the
    /// whole record and re-announce every dismissal on the next successful pull.
    private static func store(_ ids: [String], knownIds: Set<String>) {
        guard !knownIds.isEmpty else {
            UserDefaults.standard.set(Array(ids.suffix(notifiedCap)), forKey: notifiedKey)
            return
        }
        let kept = Array(ids.filter { knownIds.contains($0) }.suffix(notifiedCap))
        UserDefaults.standard.set(kept, forKey: notifiedKey)
    }

    private static func storedNotifiedIds() -> [String] {
        UserDefaults.standard.stringArray(forKey: notifiedKey) ?? []
    }
}
