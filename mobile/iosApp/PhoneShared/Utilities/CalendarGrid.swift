import Foundation

/// Builds the cell list for a Monday-based month grid. Every cell carries a
/// globally unique, stable ID (spacers are month-scoped, days use their
/// yyyy-MM-dd key), so SwiftUI never collides identities when navigating
/// months — index-based IDs made day cells vanish in the past.
enum CalendarGrid {
    enum Cell: Identifiable {
        case spacer(id: String)
        case day(number: Int, date: String)

        var id: String {
            switch self {
            case let .spacer(id): id
            case let .day(_, date): date
            }
        }
    }

    static func cells(for month: Date) -> [Cell] {
        let year = Calendar.current.component(.year, from: month)
        let monthNum = Calendar.current.component(.month, from: month)
        let monthKey = String(format: "%04d-%02d", year, monthNum)
        var cells: [Cell] = (0 ..< month.weekdayOffset).map {
            .spacer(id: "\(monthKey)-spacer-\($0)")
        }
        for day in 1 ... month.daysInMonth {
            cells.append(.day(number: day, date: String(format: "%@-%02d", monthKey, day)))
        }
        return cells
    }
}
