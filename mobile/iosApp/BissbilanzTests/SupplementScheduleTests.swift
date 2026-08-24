@testable import Bissbilanz
import Foundation
import Testing

/// Ported case-for-case from `tests/utils/supplements.test.ts` and mirrored by the Kotlin
/// `SupplementScheduleTest`. The three implementations must agree; these fixtures are the
/// only thing keeping the Swift copy from drifting.
@MainActor
struct SupplementScheduleTests {
    /// Fixed to UTC so the fixtures don't shift with the machine's timezone.
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func day(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0, minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    private func supplement(
        scheduleType: ScheduleType,
        scheduleDays: [Int]? = nil,
        scheduleStartDate: String? = nil,
        reminderTimes: [String]? = nil,
        isActive: Bool = true
    ) -> Supplement {
        Supplement(
            id: "s1", userId: "u1", name: "Vitamin D",
            scheduleType: scheduleType, scheduleDays: scheduleDays,
            scheduleStartDate: scheduleStartDate, isActive: isActive, sortOrder: 0,
            timeOfDay: nil, reminderTimes: reminderTimes, createdAt: nil, updatedAt: nil,
            ingredients: []
        )
    }

    @Test("daily is always due")
    func dailyAlwaysDue() {
        let s = supplement(scheduleType: .daily)
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 17), calendar: calendar))
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 18), calendar: calendar))
    }

    @Test("every_other_day is due on even days from the start date")
    func everyOtherDay() {
        let s = supplement(scheduleType: .everyOtherDay, scheduleStartDate: "2026-02-01")
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 1), calendar: calendar))
        #expect(!SupplementSchedule.isDue(s, on: day(2026, 2, 2), calendar: calendar))
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 3), calendar: calendar))
    }

    @Test("every_other_day defaults to due without a start date")
    func everyOtherDayNoStart() {
        let s = supplement(scheduleType: .everyOtherDay)
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 17), calendar: calendar))
    }

    @Test("every_other_day treats an unparseable start date as no start date")
    func everyOtherDayBadStart() {
        let s = supplement(scheduleType: .everyOtherDay, scheduleStartDate: "not-a-date")
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 17), calendar: calendar))
    }

    @Test("weekly is due on the matching day of week")
    func weekly() {
        // 2026-02-17 is a Tuesday -> server day 2
        #expect(SupplementSchedule.isDue(
            supplement(scheduleType: .weekly, scheduleDays: [2]), on: day(2026, 2, 17), calendar: calendar
        ))
        #expect(!SupplementSchedule.isDue(
            supplement(scheduleType: .weekly, scheduleDays: [1]), on: day(2026, 2, 17), calendar: calendar
        ))
    }

    @Test("specific_days is due on the listed days")
    func specificDays() {
        let s = supplement(scheduleType: .specificDays, scheduleDays: [1, 3, 5])
        #expect(!SupplementSchedule.isDue(s, on: day(2026, 2, 17), calendar: calendar)) // Tue
        #expect(SupplementSchedule.isDue(s, on: day(2026, 2, 18), calendar: calendar)) // Wed
    }

    @Test("Sunday maps to server day 0")
    func sundayIsZero() {
        // Apple's weekday component is 1=Sun; the server numbering is 0=Sun.
        #expect(SupplementSchedule.isDue(
            supplement(scheduleType: .specificDays, scheduleDays: [0]), on: day(2026, 2, 22), calendar: calendar
        ))
        #expect(!SupplementSchedule.isDue(
            supplement(scheduleType: .specificDays, scheduleDays: [7]), on: day(2026, 2, 22), calendar: calendar
        ))
    }

    @Test("specific_days is never due with no days set")
    func specificDaysEmpty() {
        #expect(!SupplementSchedule.isDue(
            supplement(scheduleType: .specificDays, scheduleDays: []), on: day(2026, 2, 17), calendar: calendar
        ))
        #expect(!SupplementSchedule.isDue(
            supplement(scheduleType: .specificDays), on: day(2026, 2, 17), calendar: calendar
        ))
    }

    @Test("parseTime accepts well-formed times")
    func parseTimeValid() {
        #expect(SupplementSchedule.parseTime("08:00")?.hour == 8)
        #expect(SupplementSchedule.parseTime("00:00")?.minute == 0)
        #expect(SupplementSchedule.parseTime("23:59")?.hour == 23)
        #expect(SupplementSchedule.parseTime("23:59")?.minute == 59)
    }

    @Test("parseTime rejects anything else")
    func parseTimeInvalid() {
        for bad in ["8:00", "24:00", "08:60", "08:00:00", "", "0800", "ab:cd", "08-00"] {
            #expect(SupplementSchedule.parseTime(bad) == nil, "expected nil for \(bad)")
        }
    }

    @Test("occurrences enumerate due days ascending and exclude times already past")
    func occurrencesWindow() {
        let s = supplement(scheduleType: .everyOtherDay, scheduleStartDate: "2026-02-01")
        let found = SupplementSchedule.occurrences(
            for: s, hhmm: "08:00", from: day(2026, 2, 17), days: 5, calendar: calendar
        )
        #expect(found == [day(2026, 2, 17, hour: 8), day(2026, 2, 19, hour: 8), day(2026, 2, 21, hour: 8)])

        let afterEight = SupplementSchedule.occurrences(
            for: supplement(scheduleType: .daily), hhmm: "08:00",
            from: day(2026, 2, 17, hour: 9), days: 2, calendar: calendar
        )
        #expect(afterEight == [day(2026, 2, 18, hour: 8)])
    }

    @Test("occurrences yield nothing for inactive supplements or unparseable times")
    func occurrencesGuards() {
        #expect(SupplementSchedule.occurrences(
            for: supplement(scheduleType: .daily, isActive: false), hhmm: "08:00",
            from: day(2026, 2, 17), days: 5, calendar: calendar
        ).isEmpty)
        #expect(SupplementSchedule.occurrences(
            for: supplement(scheduleType: .daily), hhmm: "8:00",
            from: day(2026, 2, 17), days: 5, calendar: calendar
        ).isEmpty)
    }

    @Test("allOccurrences merge every reminder time, sorted")
    func allOccurrencesSorted() {
        let s = supplement(scheduleType: .daily, reminderTimes: ["20:00", "08:00"])
        let found = SupplementSchedule.allOccurrences(
            for: s, from: day(2026, 2, 17), days: 2, calendar: calendar
        )
        #expect(found == [
            day(2026, 2, 17, hour: 8), day(2026, 2, 17, hour: 20),
            day(2026, 2, 18, hour: 8), day(2026, 2, 18, hour: 20),
        ])
    }

    @Test("notification identifiers encode supplement, day and time")
    func identifierFormat() {
        let id = SupplementReminderScheduler.identifier(supplementId: "abc", day: "20260217", hhmm: "08:00")
        #expect(id == "supp-abc-20260217-0800")
        // cancelToday matches on the "supp-<id>-<day>-" prefix.
        #expect(id.hasPrefix("supp-abc-20260217-"))
    }

    @Test("skip markers round-trip and prune after the retention window")
    func skipMarkers() throws {
        let supplementId = "skip-test-\(UUID().uuidString)"
        let today = Date()
        SupplementReminderSkips.markSkipped(supplementId: supplementId, on: today)
        #expect(SupplementReminderSkips.isSkipped(supplementId: supplementId, on: today))

        // A marker four days old is outside the two-day retention window.
        let old = try #require(Calendar.current.date(byAdding: .day, value: -4, to: today))
        SupplementReminderSkips.markSkipped(supplementId: supplementId, on: old)
        SupplementReminderSkips.prune(now: today)
        #expect(!SupplementReminderSkips.isSkipped(supplementId: supplementId, on: old))
        #expect(SupplementReminderSkips.isSkipped(supplementId: supplementId, on: today))

        UserDefaults.standard.removeObject(
            forKey: SupplementReminderSkips.key(supplementId: supplementId, on: today)
        )
    }
}
