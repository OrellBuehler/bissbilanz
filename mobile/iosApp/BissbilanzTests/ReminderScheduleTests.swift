@testable import Bissbilanz
import Foundation
import Testing

/// Mirrors `tests/server/reminders-validation.test.ts` (weekday numbering) and the
/// Kotlin `ReminderScheduleTest`. Also covers the iOS-only scheduling pieces:
/// identifier format, skip markers and the combined supplement/reminder budget trim.
@MainActor
struct ReminderScheduleTests {
    /// Fixed to UTC so the fixtures don't shift with the machine's timezone.
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func day(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0, minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    private func reminder(
        kind: ReminderKind = .weight,
        mealType: String? = nil,
        time: String = "08:00",
        weekdays: [Int] = Array(0 ... 6),
        enabled: Bool = true
    ) -> Reminder {
        Reminder(
            id: "r1", userId: "u1", kind: kind, mealType: mealType, time: time,
            weekdays: weekdays, enabled: enabled, createdAt: nil, updatedAt: nil
        )
    }

    // MARK: - isDue / weekday parity

    @Test("Sunday maps to server day 0")
    func sundayIsZero() {
        // 2026-02-22 is a Sunday.
        #expect(ReminderSchedule.isDue(weekdays: [0], on: day(2026, 2, 22), calendar: calendar))
        #expect(!ReminderSchedule.isDue(weekdays: [6], on: day(2026, 2, 22), calendar: calendar))
    }

    @Test("isDue matches the listed weekday")
    func isDueMatchesListedDay() {
        // 2026-02-17 is a Tuesday -> server day 2.
        #expect(ReminderSchedule.isDue(weekdays: [2], on: day(2026, 2, 17), calendar: calendar))
        #expect(!ReminderSchedule.isDue(weekdays: [1], on: day(2026, 2, 17), calendar: calendar))
    }

    @Test("isDue is never true with no days set")
    func isDueEmptyDays() {
        #expect(!ReminderSchedule.isDue(weekdays: [], on: day(2026, 2, 17), calendar: calendar))
    }

    // MARK: - occurrences

    @Test("occurrences enumerate due days ascending and exclude times already past")
    func occurrencesWindow() {
        let r = reminder(time: "08:00", weekdays: [2, 4]) // Tue, Thu
        let found = ReminderSchedule.occurrences(for: r, from: day(2026, 2, 16), days: 7, calendar: calendar)
        // 2026-02-16 is a Monday; the next Tue/Thu occurrences are the 17th and 19th.
        #expect(found == [day(2026, 2, 17, hour: 8), day(2026, 2, 19, hour: 8)])

        let afterEight = ReminderSchedule.occurrences(
            for: reminder(time: "08:00", weekdays: Array(0 ... 6)),
            from: day(2026, 2, 17, hour: 9), days: 2, calendar: calendar
        )
        #expect(afterEight == [day(2026, 2, 18, hour: 8)])
    }

    @Test("occurrences yield nothing for disabled reminders or unparseable times")
    func occurrencesGuards() {
        #expect(ReminderSchedule.occurrences(
            for: reminder(enabled: false), from: day(2026, 2, 17), days: 5, calendar: calendar
        ).isEmpty)
        #expect(ReminderSchedule.occurrences(
            for: reminder(time: "8:00"), from: day(2026, 2, 17), days: 5, calendar: calendar
        ).isEmpty)
    }

    // MARK: - Identifiers

    @Test("notification identifiers encode reminder id, day and time")
    func identifierFormat() {
        let id = ReminderScheduler.identifier(reminderId: "abc", day: "20260217", hhmm: "08:00")
        #expect(id == "rem-abc-20260217-0800")
        // `cancelToday` matches on the "rem-<id>-<day>-" prefix.
        #expect(id.hasPrefix("rem-abc-20260217-"))
    }

    // MARK: - Skip markers

    @Test("skip markers round-trip and prune after the retention window")
    func skipMarkers() throws {
        let reminderId = "skip-test-\(UUID().uuidString)"
        let today = Date()
        ReminderSkips.markSkipped(reminderId: reminderId, on: today)
        #expect(ReminderSkips.isSkipped(reminderId: reminderId, on: today))

        // A marker four days old is outside the two-day retention window.
        let old = try #require(Calendar.current.date(byAdding: .day, value: -4, to: today))
        ReminderSkips.markSkipped(reminderId: reminderId, on: old)
        ReminderSkips.prune(now: today)
        #expect(!ReminderSkips.isSkipped(reminderId: reminderId, on: old))
        #expect(ReminderSkips.isSkipped(reminderId: reminderId, on: today))

        UserDefaults.standard.removeObject(forKey: ReminderSkips.key(reminderId: reminderId, on: today))
    }

    // MARK: - Combined budget trim

    @Test("trimmedCombined merges both kinds, sorts soonest-first and keeps the budget")
    func trimmedCombinedMergesAndSorts() {
        let now = day(2026, 2, 17)
        let supplementCandidates = (0 ..< 3).map { offset in
            SupplementReminderScheduler.ScheduledCandidate(
                identifier: "supp-\(offset)",
                date: calendar.date(byAdding: .minute, value: offset * 10, to: now)!
            )
        }
        let reminderCandidates = (0 ..< 3).map { offset in
            SupplementReminderScheduler.ScheduledCandidate(
                identifier: "rem-\(offset)",
                date: calendar.date(byAdding: .minute, value: offset * 10 + 5, to: now)!
            )
        }
        let kept = SupplementReminderScheduler.trimmedCombined(
            supplementCandidates + reminderCandidates, budget: 4
        )
        #expect(kept.map(\.identifier) == ["supp-0", "rem-0", "supp-1", "rem-1"])
    }

    @Test("trimmedCombined keeps everything when under budget")
    func trimmedCombinedUnderBudget() {
        let now = day(2026, 2, 17)
        let candidates = [
            SupplementReminderScheduler.ScheduledCandidate(identifier: "a", date: now),
            SupplementReminderScheduler.ScheduledCandidate(
                identifier: "b", date: calendar.date(byAdding: .minute, value: 1, to: now)!
            ),
        ]
        let kept = SupplementReminderScheduler.trimmedCombined(candidates, budget: 56)
        #expect(kept == candidates)
    }

    // MARK: - Decode

    @Test("Reminder decodes from the server envelope")
    func decodesFromServerFixture() throws {
        let json = """
        {
            "id": "9c6b3b0e-6b3e-4a2a-8b8a-1a2b3c4d5e6f",
            "userId": "1c6b3b0e-6b3e-4a2a-8b8a-1a2b3c4d5e6f",
            "kind": "meal",
            "mealType": "Lunch",
            "time": "12:30",
            "weekdays": [1, 2, 3, 4, 5],
            "enabled": true,
            "createdAt": "2026-02-17T08:00:00.000Z",
            "updatedAt": "2026-02-17T08:00:00.000Z"
        }
        """
        let reminder = try JSONDecoder().decode(Reminder.self, from: Data(json.utf8))
        #expect(reminder.kind == .meal)
        #expect(reminder.mealType == "Lunch")
        #expect(reminder.time == "12:30")
        #expect(reminder.weekdays == [1, 2, 3, 4, 5])
        #expect(reminder.enabled)
        #expect(reminder.createdAt != nil)
    }

    @Test("Reminder decodes without createdAt/updatedAt")
    func decodesWithoutTimestamps() throws {
        let json = """
        {
            "id": "9c6b3b0e-6b3e-4a2a-8b8a-1a2b3c4d5e6f",
            "userId": "1c6b3b0e-6b3e-4a2a-8b8a-1a2b3c4d5e6f",
            "kind": "weight",
            "mealType": null,
            "time": "08:00",
            "weekdays": [0, 1, 2, 3, 4, 5, 6],
            "enabled": false
        }
        """
        let reminder = try JSONDecoder().decode(Reminder.self, from: Data(json.utf8))
        #expect(reminder.kind == .weight)
        #expect(reminder.mealType == nil)
        #expect(!reminder.enabled)
        #expect(reminder.createdAt == nil)
        #expect(reminder.updatedAt == nil)
    }
}
