import Foundation

/// Schedule maths for supplements — which days a supplement is due, and when its
/// reminder times fall. Pure Foundation so it compiles in the widget extension too.
///
/// Mirrors `src/lib/utils/supplements.ts` on the web and
/// `shared/src/commonMain/kotlin/com/bissbilanz/util/SupplementSchedule.kt` on Android.
/// The three must agree — `SupplementScheduleTests` ports the web's fixture set verbatim.
enum SupplementSchedule {
    /// Determine if a supplement is due on a given day.
    ///
    /// `scheduleDays` uses the server's Sun=0..Sat=6 numbering, so Apple's 1=Sun weekday
    /// component is shifted down by one.
    static func isDue(
        scheduleType: ScheduleType,
        scheduleDays: [Int]?,
        scheduleStartDate: String?,
        on date: Date,
        calendar: Calendar = .current
    ) -> Bool {
        switch scheduleType {
        case .daily:
            return true

        case .everyOtherDay:
            // Parsed as a bare local date and diffed in whole days: building a Date at UTC
            // midnight and comparing instants phase-shifts users west of UTC by a day.
            guard let startDate = scheduleStartDate.flatMap({ parseDay($0, calendar: calendar) }) else {
                return true
            }
            let start = calendar.startOfDay(for: startDate)
            let day = calendar.startOfDay(for: date)
            guard let days = calendar.dateComponents([.day], from: start, to: day).day else { return true }
            return days % 2 == 0

        case .weekly, .specificDays:
            guard let scheduleDays, !scheduleDays.isEmpty else { return false }
            return scheduleDays.contains(calendar.component(.weekday, from: date) - 1)
        }
    }

    static func isDue(_ supplement: Supplement, on date: Date, calendar: Calendar = .current) -> Bool {
        isDue(
            scheduleType: supplement.scheduleType,
            scheduleDays: supplement.scheduleDays,
            scheduleStartDate: supplement.scheduleStartDate,
            on: date,
            calendar: calendar
        )
    }

    /// Strictly parse an `HH:MM` wall-clock reminder time. Returns nil on anything else so a
    /// corrupted server value degrades to "no reminder" instead of crashing the scheduler.
    static func parseTime(_ hhmm: String) -> (hour: Int, minute: Int)? {
        let parts = hhmm.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 2, parts[1].count == 2,
              let hour = Int(parts[0]), let minute = Int(parts[1]),
              (0 ... 23).contains(hour), (0 ... 59).contains(minute)
        else { return nil }
        return (hour, minute)
    }

    /// Every due-day occurrence of `hhmm` strictly after `from` within the next `days` days,
    /// ascending. Inactive supplements and unparseable times yield nothing.
    static func occurrences(
        for supplement: Supplement,
        hhmm: String,
        from: Date = Date(),
        days: Int,
        calendar: Calendar = .current
    ) -> [Date] {
        guard supplement.isActive, let time = parseTime(hhmm) else { return [] }
        var result: [Date] = []
        let today = calendar.startOfDay(for: from)
        for offset in 0 ..< days {
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  isDue(supplement, on: day, calendar: calendar),
                  let fireDate = calendar.date(
                      bySettingHour: time.hour, minute: time.minute, second: 0, of: day
                  ),
                  fireDate > from
            else { continue }
            result.append(fireDate)
        }
        return result
    }

    /// Every occurrence of every reminder time on `supplement`, ascending.
    static func allOccurrences(
        for supplement: Supplement,
        from: Date = Date(),
        days: Int,
        calendar: Calendar = .current
    ) -> [Date] {
        (supplement.reminderTimes ?? [])
            .flatMap { occurrences(for: supplement, hhmm: $0, from: from, days: days, calendar: calendar) }
            .sorted()
    }

    private static func parseDay(_ iso: String, calendar: Calendar) -> Date? {
        let parts = iso.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2])
        else { return nil }
        return calendar.date(from: DateComponents(year: year, month: month, day: day))
    }
}
