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

    static func isoString(from date: Date) -> String {
        isoFormatter.string(from: date)
    }

    static func date(from isoString: String) -> Date? {
        isoFormatter.date(from: isoString)
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
