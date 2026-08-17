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
