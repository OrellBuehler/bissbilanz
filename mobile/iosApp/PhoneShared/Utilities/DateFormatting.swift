import Foundation

enum DateFormatting {
    private static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let displayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f
    }()

    private static let monthYearFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f
    }()

    private static let isoDateTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    private static let isoDateTimeFractionalFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f
    }()

    static func isoString(from date: Date) -> String {
        isoFormatter.string(from: date)
    }

    /// UTC ISO-8601 timestamp ("2026-06-12T05:30:00Z") — the wire format for
    /// `bedtime`/`wakeTime`.
    static func isoDateTimeString(from date: Date) -> String {
        isoDateTimeFormatter.string(from: date)
    }

    /// Parses ISO-8601 timestamps with or without fractional seconds (the
    /// server serializes with milliseconds, the app writes without).
    static func isoDateTime(from string: String) -> Date? {
        isoDateTimeFractionalFormatter.date(from: string) ?? isoDateTimeFormatter.date(from: string)
    }

    static func timeString(from date: Date) -> String {
        timeFormatter.string(from: date)
    }

    /// A picked time-of-day placed on a picked day, as the UTC ISO-8601 `eatenAt`
    /// wire value. Seconds are zeroed so a re-save doesn't nudge the timestamp.
    /// `nil` when the two can't be combined — the caller then leaves `eatenAt`
    /// alone rather than writing a wrong time.
    ///
    /// Assembled from components rather than with `date(bySettingHour:of:)`: that
    /// one searches *forward* from `day`, so an afternoon `day` (the picker falls
    /// back to the logged instant when an entry carries no date string) plus a
    /// morning `time` lands the meal on tomorrow.
    static func eatenAtString(time: Date, on day: Date, calendar: Calendar = .current) -> String? {
        let clock = calendar.dateComponents([.hour, .minute], from: time)
        var components = calendar.dateComponents([.year, .month, .day], from: day)
        components.hour = clock.hour ?? 0
        components.minute = clock.minute ?? 0
        components.second = 0
        guard let combined = calendar.date(from: components) else { return nil }
        return isoDateTimeString(from: combined)
    }

    static func date(from isoString: String) -> Date? {
        // ICU parsing is lenient about punctuation (e.g. "2026/03/12" matches
        // "yyyy-MM-dd"); round-trip to accept canonical ISO strings only.
        guard let date = isoFormatter.date(from: isoString),
              isoFormatter.string(from: date) == isoString
        else { return nil }
        return date
    }

    static func displayString(from date: Date) -> String {
        displayFormatter.string(from: date)
    }

    static func monthYear(from date: Date) -> String {
        monthYearFormatter.string(from: date)
    }

    /// The span every client lets an entry be dated into, matching the server's
    /// own bound. Wide enough that no real log is refused, narrow enough that a
    /// few flicks of a date picker can't park a meal in the year 3000.
    static let entryDateRange: ClosedRange<Date> = {
        let start = date(from: "1900-01-01") ?? Date(timeIntervalSince1970: -2_208_988_800)
        let end = date(from: "2100-12-31") ?? Date(timeIntervalSince1970: 4_133_894_400)
        return start ... end
    }()

    static var today: String {
        isoString(from: Date())
    }

    /// Whole days between two "yyyy-MM-dd" strings, ignoring direction.
    /// Unparseable input counts as infinitely far.
    static func dayDistance(_ a: String, _ b: String) -> Int {
        guard let dateA = date(from: a), let dateB = date(from: b) else { return .max }
        return abs(Calendar.current.dateComponents([.day], from: dateA, to: dateB).day ?? 0)
    }
}

extension Date {
    var isoDateString: String {
        DateFormatting.isoString(from: self)
    }

    func adding(days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: self) ?? self
    }

    func adding(months: Int) -> Date {
        Calendar.current.date(byAdding: .month, value: months, to: self) ?? self
    }

    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }

    var startOfMonth: Date {
        let components = Calendar.current.dateComponents([.year, .month], from: self)
        return Calendar.current.date(from: components) ?? self
    }

    var daysInMonth: Int {
        Calendar.current.range(of: .day, in: .month, for: self)?.count ?? 30
    }

    var weekdayOffset: Int {
        let weekday = Calendar.current.component(.weekday, from: startOfMonth)
        // Convert to Monday=0 based
        return (weekday + 5) % 7
    }
}
