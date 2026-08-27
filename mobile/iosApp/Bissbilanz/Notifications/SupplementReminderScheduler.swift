import Foundation
import UserNotifications

/// Schedules supplement reminders as local notifications.
///
/// iOS caps an app at **64 pending notification requests** and silently drops the rest, so
/// this keeps a rolling window rather than scheduling everything: it enumerates the next
/// `windowDays` of due occurrences, takes the soonest `slotBudget`, and refills whenever
/// the app gets a chance to run.
///
/// Every request is one-shot (`repeats: false`) with full year/month/day components. A
/// repeating `UNCalendarNotificationTrigger` would be far cheaper on slots, but it cannot
/// express `every_other_day` at all, and removing a repeating request to suppress *today's*
/// reminder (because the supplement was already taken) would kill the whole series.
///
/// Only `refill` is `@MainActor` (it reads the repository). Everything else stays
/// nonisolated so the notification delegate's callbacks — which arrive off the main actor
/// with non-Sendable arguments — can call it directly.
enum SupplementReminderScheduler {
    static let categoryIdentifier = "SUPPLEMENT_REMINDER"
    static let identifierPrefix = "supp-"
    static let snoozePrefix = "supp-snooze-"

    static let takenAction = "SUPP_TAKEN"
    static let snoozeAction = "SUPP_SNOOZE"
    static let skipAction = "SUPP_SKIP"

    static let userInfoSupplementId = "supplementId"
    static let userInfoTime = "reminderTime"
    /// The `yyyy-MM-dd` day the reminder is *for*. Actions must log against this, never
    /// against the day of the tap: a 20:00 reminder acted on at 00:30 belongs to the
    /// previous day. (The request identifier encodes the same day, but a snoozed copy
    /// gets a fresh identifier, so the date has to live in userInfo to survive a snooze.)
    static let userInfoDate = "occurrenceDate"

    static let snoozeMinutesKey = "supplement_snooze_minutes"
    static let defaultSnoozeMinutes = 15

    /// Presets offered in Settings; matches the Android dropdown.
    static let snoozePresets = [5, 10, 15, 30, 60, 120, 180]

    /// How far ahead occurrences are enumerated.
    private static let windowDays = 14

    /// Leaves ~8 of the system's 64 slots free for snoozes.
    private static let slotBudget = 56

    // MARK: - Setup

    /// Registers the reminder category. Free, and must be in place before any request is
    /// scheduled, so it runs at launch regardless of authorization.
    static func registerCategory() {
        let category = UNNotificationCategory(
            identifier: categoryIdentifier,
            actions: [
                // None are `.foreground`: each does a local SwiftData write or a bit of
                // scheduling, all of it milliseconds. Launching the whole app for a
                // one-tap confirm would defeat the point of an actionable notification.
                UNNotificationAction(identifier: takenAction, title: L10n.markTaken, options: []),
                UNNotificationAction(identifier: snoozeAction, title: L10n.remindLater, options: []),
                // .destructive is styling only — it still runs in the background.
                UNNotificationAction(identifier: skipAction, title: L10n.skipToday, options: [.destructive]),
            ],
            intentIdentifiers: [],
            // Deliberately no .customDismissAction: swiping a reminder away is not a skip.
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    /// Asks for permission, once, at the moment of intent — when the user adds their first
    /// reminder time. Never at launch: an unexplained permission alert on first run is the
    /// most reliable way to earn a permanent deny from someone who might have said yes later.
    @discardableResult
    static func requestAuthorizationIfNeeded() async -> Bool {
        switch await authorizationStatus() {
        case .notDetermined:
            await withCheckedContinuation { continuation in
                UNUserNotificationCenter.current()
                    .requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                        continuation.resume(returning: granted)
                    }
            }
        case .denied:
            // Cannot be re-prompted; Settings surfaces a link to the system page.
            false
        default:
            true
        }
    }

    /// `UNNotificationSettings` is not Sendable, so only the status enum leaves the
    /// callback. Same trick throughout this file: read what we need inside the closure and
    /// resume with plain values.
    static func authorizationStatus() async -> UNAuthorizationStatus {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
    }

    /// Identifiers of everything currently scheduled. `UNNotificationRequest` is not
    /// Sendable; the identifiers are.
    private static func pendingIdentifiers() async -> [String] {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
                continuation.resume(returning: requests.map(\.identifier))
            }
        }
    }

    /// Identifiers of reminders already sitting in Notification Center.
    private static func deliveredIdentifiers() async -> [String] {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
                continuation.resume(returning: notifications.map(\.request.identifier))
            }
        }
    }

    // MARK: - Refill

    /// Rebuilds the rolling window from the current supplements.
    ///
    /// Diffs against what is already pending rather than clearing and re-adding, so a
    /// refill neither churns the whole set nor leaves a moment with nothing scheduled.
    @MainActor
    static func refill(repository: SupplementRepository, now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        guard await authorizationStatus() == .authorized else { return }

        SupplementReminderSkips.prune(now: now)

        let supplements = repository.supplements()
        let loggedToday = repository.loggedSupplementIds(date: DateFormatting.today)
        let todayKey = SupplementReminderDay.key(for: now)
        var wanted: [(identifier: String, date: Date, supplement: Supplement)] = []
        for supplement in supplements where supplement.isActive {
            guard let times = supplement.reminderTimes, !times.isEmpty else { continue }
            for hhmm in times {
                for fireDate in SupplementSchedule.occurrences(
                    for: supplement, hhmm: hhmm, from: now, days: windowDays
                ) {
                    let day = SupplementReminderDay.key(for: fireDate)
                    // Already ticked off today, or skipped on this device.
                    if day == todayKey {
                        if loggedToday.contains(supplement.id) { continue }
                        if SupplementReminderSkips.isSkipped(supplementId: supplement.id, on: now) { continue }
                    }
                    wanted.append((
                        identifier: identifier(supplementId: supplement.id, day: day, hhmm: hhmm),
                        date: fireDate,
                        supplement: supplement
                    ))
                }
            }
        }

        // Soonest first, so the budget is spent on the reminders that fire next.
        wanted.sort { $0.date < $1.date }
        let keep = Array(wanted.prefix(slotBudget))
        let keepIds = Set(keep.map(\.identifier))

        let pending = await pendingIdentifiers()
        let stale = pending
            // Snoozes are one-offs this pass knows nothing about; leave them alone.
            .filter { $0.hasPrefix(identifierPrefix) && !$0.hasPrefix(snoozePrefix) && !keepIds.contains($0) }
        if !stale.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: stale)
        }

        let pendingIds = Set(pending)
        for item in keep where !pendingIds.contains(item.identifier) {
            let components = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute], from: item.date
            )
            let request = UNNotificationRequest(
                identifier: item.identifier,
                content: content(
                    for: item.supplement,
                    hhmm: time(from: item.identifier),
                    date: DateFormatting.isoString(from: item.date)
                ),
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            )
            // The completion-handler form: `add(_:)`'s async form would send a
            // non-Sendable UNNotificationRequest across an isolation boundary.
            center.add(request, withCompletionHandler: nil)
        }
    }

    // MARK: - Cancellation

    /// Drops today's reminders for a supplement, pending and already delivered.
    ///
    /// iOS runs no code before a local notification is delivered, so suppressing a reminder
    /// for something already taken has to happen at log time — this is called from
    /// `SupplementRepository.logSupplement`, which every log path funnels through.
    static func cancelToday(supplementId: String, on date: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let dayPrefix = "\(identifierPrefix)\(supplementId)-\(SupplementReminderDay.key(for: date))-"
        let snoozeIdPrefix = "\(snoozePrefix)\(supplementId)-"

        let pending = await pendingIdentifiers()
        let delivered = await deliveredIdentifiers()
        let matches = (pending + delivered).filter {
            $0.hasPrefix(dayPrefix) || $0.hasPrefix(snoozeIdPrefix)
        }
        guard !matches.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: matches)
        center.removeDeliveredNotifications(withIdentifiers: matches)
    }

    // MARK: - Snooze

    static func snooze(_ payload: SupplementReminderPayload) {
        let minutes = storedSnoozeMinutes()
        let content = UNMutableNotificationContent()
        // Rebuilt from the delivered notification's values so the snoozed copy keeps the
        // same title, body and supplement id — and therefore the same actions.
        content.title = payload.title
        content.body = payload.body
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        var userInfo: [String: Any] = [userInfoSupplementId: payload.supplementId ?? ""]
        // Keep the original occurrence's day: a snooze taken past midnight must still
        // mark the day the reminder fired.
        if let date = payload.date { userInfo[userInfoDate] = date }
        content.userInfo = userInfo

        let supplementId = payload.supplementId ?? "unknown"
        let request = UNNotificationRequest(
            identifier: "\(snoozePrefix)\(supplementId)-\(UUID().uuidString)",
            content: content,
            // Clamped: timeInterval must be > 0, and a bad stored value must not produce
            // an immediate re-fire loop.
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: max(60, Double(minutes) * 60), repeats: false
            )
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    static func storedSnoozeMinutes() -> Int {
        // Read straight from UserDefaults — the delegate is not a View, and @AppStorage
        // is backed by the same store.
        let stored = UserDefaults.standard.integer(forKey: snoozeMinutesKey)
        return stored > 0 ? stored : defaultSnoozeMinutes
    }

    // MARK: - Identifiers

    static func identifier(supplementId: String, day: String, hhmm: String) -> String {
        "\(identifierPrefix)\(supplementId)-\(day)-\(hhmm.replacingOccurrences(of: ":", with: ""))"
    }

    /// Recovers `HH:MM` from an identifier's trailing `HHmm`.
    private nonisolated static func time(from identifier: String) -> String {
        let compact = identifier.suffix(4)
        guard compact.count == 4 else { return "" }
        return "\(compact.prefix(2)):\(compact.suffix(2))"
    }

    private static func content(
        for supplement: Supplement, hhmm: String, date: String
    ) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = L10n.supplementReminderTitle(supplement.name)
        content.body = supplement.ingredients.map(\.food.name).joined(separator: ", ")
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        content.userInfo = [
            userInfoSupplementId: supplement.id,
            userInfoTime: hhmm,
            userInfoDate: date,
        ]
        return content
    }
}

/// "Skip today" markers. Device-local and unsynced, matching Android: skipping is a
/// decision about this phone right now, not a fact about the supplement.
enum SupplementReminderSkips {
    private static let prefix = "supp_skip_"
    private static let retentionDays = 2

    static func key(supplementId: String, on date: Date) -> String {
        "\(prefix)\(supplementId)_\(SupplementReminderDay.key(for: date))"
    }

    static func markSkipped(supplementId: String, on date: Date = Date()) {
        UserDefaults.standard.set(true, forKey: key(supplementId: supplementId, on: date))
    }

    static func isSkipped(supplementId: String, on date: Date) -> Bool {
        UserDefaults.standard.bool(forKey: key(supplementId: supplementId, on: date))
    }

    /// Drops markers older than the retention window so the defaults dictionary can't grow
    /// without bound.
    static func prune(now: Date = Date()) {
        let calendar = Calendar.current
        let keep = Set((0 ... retentionDays).compactMap { offset -> String? in
            calendar.date(byAdding: .day, value: -offset, to: now).map { SupplementReminderDay.key(for: $0) }
        })
        let defaults = UserDefaults.standard
        for storedKey in defaults.dictionaryRepresentation().keys where storedKey.hasPrefix(prefix) {
            let day = String(storedKey.suffix(8))
            if !keep.contains(day) {
                defaults.removeObject(forKey: storedKey)
            }
        }
    }
}

/// `yyyyMMdd` day key used inside notification identifiers and skip markers.
///
/// Built from date components rather than a DateFormatter: it is a machine key, never
/// shown to anyone, so it must not pick up a locale's calendar (a Buddhist or Japanese
/// calendar would silently change every identifier) — and a shared formatter would be
/// mutable state across isolation domains.
enum SupplementReminderDay {
    /// Gregorian rather than `.current`, which was the very calendar the note
    /// above rules out: a user switching their device to a Buddhist or
    /// Japanese calendar re-keyed every pending reminder identifier at once.
    /// The time zone stays the device's, so the day boundary is still local —
    /// read per call rather than cached, since it changes when the user travels.
    static func key(for date: Date, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d%02d%02d",
            components.year ?? 0, components.month ?? 0, components.day ?? 0
        )
    }
}
