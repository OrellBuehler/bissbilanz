import Foundation
import UserNotifications

/// Schedules general (weight/meal/sleep) logging reminders as local
/// notifications — the counterpart of `SupplementReminderScheduler` for the
/// `reminders` table.
///
/// Occurrences, identifiers, actions and skip markers all mirror the
/// supplement scheduler; the one thing that does NOT live here is the actual
/// `UNNotificationRequest` scheduling loop. iOS caps an app at 64 pending
/// requests total, so both schedulers share one budget — that combined refill
/// is `SupplementReminderScheduler.refill`, which calls `wanted(dependencies:)`
/// below to fold reminder candidates into the same pass. See that type's doc
/// for the budget/diffing rationale.
enum ReminderScheduler {
    static let categoryIdentifier = "LOGGING_REMINDER"
    static let identifierPrefix = "rem-"
    static let snoozePrefix = "rem-snooze-"

    static let snoozeAction = "REM_SNOOZE"
    static let skipAction = "REM_SKIP"

    static let userInfoReminderId = "reminderId"
    static let userInfoKind = "kind"
    /// The `yyyy-MM-dd` day the reminder is *for* — see the identical field on
    /// `SupplementReminderScheduler` for why this has to travel in userInfo
    /// rather than be re-derived from the tap time.
    static let userInfoDate = "occurrenceDate"

    /// How far ahead occurrences are enumerated — matches the supplement scheduler's window.
    static let windowDays = 14

    /// Read-only access the "already logged today" check needs, alongside the
    /// reminder list itself. Bundled so `refill` callers only have to build
    /// this once from repositories they already hold.
    struct SchedulingDependencies {
        let reminderRepository: ReminderRepository
        let weightRepository: WeightRepository
        let sleepRepository: SleepRepository
        let entryRepository: EntryRepository
    }

    /// One reminder occurrence considered during a combined refill pass.
    struct WantedReminder {
        let identifier: String
        let date: Date
        let content: UNMutableNotificationContent
    }

    // MARK: - Setup

    /// Registers the reminder category. Free, and must be in place before any
    /// request is scheduled — see `SupplementReminderScheduler.registerCategory`.
    static func registerCategory() {
        let category = UNNotificationCategory(
            identifier: categoryIdentifier,
            actions: [
                UNNotificationAction(identifier: snoozeAction, title: L10n.remindLater, options: []),
                UNNotificationAction(identifier: skipAction, title: L10n.skipToday, options: [.destructive]),
            ],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    // MARK: - Candidates (for the combined refill)

    /// Every reminder occurrence this scheduler wants scheduled in the
    /// rolling window, with today's already-logged/skipped occurrences
    /// filtered out. Does not schedule anything itself — the combined refill
    /// in `SupplementReminderScheduler` owns the shared 64-slot budget.
    @MainActor
    static func wanted(dependencies: SchedulingDependencies, now: Date = Date()) -> [WantedReminder] {
        ReminderSkips.prune(now: now)
        let reminders = dependencies.reminderRepository.reminders()
        let todayKey = SupplementReminderDay.key(for: now)
        let today = DateFormatting.today
        var result: [WantedReminder] = []
        for reminder in reminders {
            for fireDate in ReminderSchedule.occurrences(for: reminder, from: now, days: windowDays) {
                let day = SupplementReminderDay.key(for: fireDate)
                if day == todayKey {
                    if isAlreadyLogged(reminder, today: today, dependencies: dependencies) { continue }
                    if ReminderSkips.isSkipped(reminderId: reminder.id, on: now) { continue }
                }
                let id = identifier(reminderId: reminder.id, day: day, hhmm: reminder.time)
                result.append(WantedReminder(
                    identifier: id,
                    date: fireDate,
                    content: content(for: reminder, date: DateFormatting.isoString(from: fireDate))
                ))
            }
        }
        return result
    }

    @MainActor
    private static func isAlreadyLogged(
        _ reminder: Reminder, today: String, dependencies: SchedulingDependencies
    ) -> Bool {
        switch reminder.kind {
        case .weight:
            dependencies.weightRepository.entryDates().contains(today)
        case .sleep:
            dependencies.sleepRepository.entryDates().contains(today)
        case .meal:
            guard let mealType = reminder.mealType else { return false }
            return dependencies.entryRepository.entries(date: today).contains { $0.mealType == mealType }
        }
    }

    // MARK: - Cancellation

    /// Drops today's occurrence of one reminder, pending and already
    /// delivered, plus any of its still-pending snoozes.
    static func cancelToday(reminderId: String, on date: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let dayPrefix = "\(identifierPrefix)\(reminderId)-\(SupplementReminderDay.key(for: date))-"
        let snoozeIdPrefix = "\(snoozePrefix)\(reminderId)-"

        let pending = await pendingIdentifiers()
        let delivered = await deliveredIdentifiers()
        let matches = (pending + delivered).filter {
            $0.hasPrefix(dayPrefix) || $0.hasPrefix(snoozeIdPrefix)
        }
        guard !matches.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: matches)
        center.removeDeliveredNotifications(withIdentifiers: matches)
    }

    /// Cancels today's occurrence of every reminder of `kind` (and, for meal
    /// reminders, matching `mealType`) — called after the user logs weight,
    /// sleep or a meal entry for today, mirroring
    /// `SupplementReminderScheduler.cancelToday`'s call from `logSupplement`.
    @MainActor
    static func cancelToday(
        repository: ReminderRepository,
        kind: ReminderKind,
        mealType: String? = nil,
        on date: Date = Date()
    ) async {
        let matches = repository.reminders().filter {
            $0.kind == kind && (kind != .meal || $0.mealType == mealType)
        }
        for reminder in matches {
            await cancelToday(reminderId: reminder.id, on: date)
        }
    }

    // MARK: - Snooze

    static func snooze(_ payload: ReminderNotificationPayload) {
        let minutes = SupplementReminderScheduler.storedSnoozeMinutes()
        let content = UNMutableNotificationContent()
        content.title = payload.title
        content.body = payload.body
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        var userInfo: [String: Any] = [:]
        if let reminderId = payload.reminderId { userInfo[userInfoReminderId] = reminderId }
        if let kind = payload.kind { userInfo[userInfoKind] = kind }
        // Keep the original occurrence's day — a snooze taken past midnight
        // must still mark the day the reminder fired.
        if let date = payload.date { userInfo[userInfoDate] = date }
        content.userInfo = userInfo

        let reminderId = payload.reminderId ?? "unknown"
        let request = UNNotificationRequest(
            identifier: "\(snoozePrefix)\(reminderId)-\(UUID().uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: max(60, Double(minutes) * 60), repeats: false
            )
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    // MARK: - Identifiers

    static func identifier(reminderId: String, day: String, hhmm: String) -> String {
        "\(identifierPrefix)\(reminderId)-\(day)-\(hhmm.replacingOccurrences(of: ":", with: ""))"
    }

    // MARK: - Content

    private static func content(for reminder: Reminder, date: String) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = title(for: reminder)
        content.body = body(for: reminder)
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        content.userInfo = [
            userInfoReminderId: reminder.id,
            userInfoKind: reminder.kind.rawValue,
            userInfoDate: date,
        ]
        return content
    }

    private static func title(for reminder: Reminder) -> String {
        switch reminder.kind {
        case .weight: L10n.reminderWeightTitle
        case .sleep: L10n.reminderSleepTitle
        case .meal: L10n.reminderMealTitle(reminder.mealType ?? "")
        }
    }

    private static func body(for reminder: Reminder) -> String {
        switch reminder.kind {
        case .weight: L10n.reminderWeightBody
        case .sleep: L10n.reminderSleepBody
        case .meal: L10n.reminderMealBody(reminder.mealType ?? "")
        }
    }

    // MARK: - Pending/delivered lookups

    /// `UNNotificationRequest` is not Sendable; only the identifiers leave the callback.
    private static func pendingIdentifiers() async -> [String] {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
                continuation.resume(returning: requests.map(\.identifier))
            }
        }
    }

    private static func deliveredIdentifiers() async -> [String] {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
                continuation.resume(returning: notifications.map(\.request.identifier))
            }
        }
    }
}

/// "Skip today" markers. Device-local and unsynced — the reminder-kind
/// counterpart of `SupplementReminderSkips`.
enum ReminderSkips {
    private static let prefix = "rem_skip_"
    private static let retentionDays = 2
    private static let indexKey = "rem_skip_keys"

    static func key(reminderId: String, on date: Date) -> String {
        "\(prefix)\(reminderId)_\(SupplementReminderDay.key(for: date))"
    }

    static func markSkipped(reminderId: String, on date: Date = Date()) {
        let defaults = UserDefaults.standard
        let markerKey = key(reminderId: reminderId, on: date)
        defaults.set(true, forKey: markerKey)
        var index = storedKeys(defaults)
        guard !index.contains(markerKey) else { return }
        index.append(markerKey)
        defaults.set(index, forKey: indexKey)
    }

    static func isSkipped(reminderId: String, on date: Date) -> Bool {
        UserDefaults.standard.bool(forKey: key(reminderId: reminderId, on: date))
    }

    /// Drops markers older than the retention window — see
    /// `SupplementReminderSkips.prune` for why the live keys are tracked
    /// separately instead of scanning `UserDefaults` every call.
    static func prune(now: Date = Date()) {
        let calendar = Calendar.current
        let keep = Set((0 ... retentionDays).compactMap { offset -> String? in
            calendar.date(byAdding: .day, value: -offset, to: now).map { SupplementReminderDay.key(for: $0) }
        })
        let defaults = UserDefaults.standard
        var kept: [String] = []
        for storedKey in storedKeys(defaults) {
            if keep.contains(String(storedKey.suffix(8))) {
                kept.append(storedKey)
            } else {
                defaults.removeObject(forKey: storedKey)
            }
        }
        defaults.set(kept, forKey: indexKey)
    }

    private static func storedKeys(_ defaults: UserDefaults) -> [String] {
        if let index = defaults.stringArray(forKey: indexKey) { return index }
        let seeded = defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefix) }
        defaults.set(seeded, forKey: indexKey)
        return seeded
    }
}

/// The Sendable slice of a delivered reminder notification the main actor needs.
/// Counterpart of `SupplementReminderPayload`.
struct ReminderNotificationPayload {
    let reminderId: String?
    let kind: String?
    /// `yyyy-MM-dd` day the reminder was scheduled for.
    let date: String?
    let title: String
    let body: String
}
