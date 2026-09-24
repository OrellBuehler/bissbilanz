import Foundation

/// Schedule maths for general (weight/meal/sleep) reminders — which days a
/// reminder is due, and when its one daily time falls. Pure Foundation so it
/// compiles in the widget extension too.
///
/// Mirrors `src/lib/server/push/reminders.ts` on the web and the Kotlin
/// `ReminderSchedule` on Android. `weekdays` uses the server's Sun=0..Sat=6
/// numbering, same as `SupplementSchedule` and supplement `scheduleDays`.
enum ReminderSchedule {
    static func isDue(weekdays: [Int], on date: Date, calendar: Calendar = .current) -> Bool {
        weekdays.contains(calendar.component(.weekday, from: date) - 1)
    }

    static func isDue(_ reminder: Reminder, on date: Date, calendar: Calendar = .current) -> Bool {
        isDue(weekdays: reminder.weekdays, on: date, calendar: calendar)
    }

    /// Every due-day occurrence of the reminder's time strictly after `from`
    /// within the next `days` days, ascending. Disabled reminders and
    /// unparseable times yield nothing.
    static func occurrences(
        for reminder: Reminder,
        from: Date = Date(),
        days: Int,
        calendar: Calendar = .current
    ) -> [Date] {
        // `parseTime` is a plain HH:MM parser with no supplement-specific
        // behavior — reused rather than duplicated.
        guard reminder.enabled, let time = SupplementSchedule.parseTime(reminder.time) else { return [] }
        var result: [Date] = []
        let today = calendar.startOfDay(for: from)
        for offset in 0 ..< days {
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  isDue(reminder, on: day, calendar: calendar),
                  let fireDate = calendar.date(
                      bySettingHour: time.hour, minute: time.minute, second: 0, of: day
                  ),
                  fireDate > from
            else { continue }
            result.append(fireDate)
        }
        return result
    }
}
