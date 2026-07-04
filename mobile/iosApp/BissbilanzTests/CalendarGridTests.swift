@testable import Bissbilanz
import Foundation
import Testing

@Suite("Calendar Grid Tests")
struct CalendarGridTests {
    @Test("July 2026 starts on Wednesday: two leading spacers, then day 1")
    func julyLeadingSpacers() throws {
        let july = try #require(DateFormatting.date(from: "2026-07-15"))
        let cells = CalendarGrid.cells(for: july)

        #expect(cells.count == 2 + 31)
        guard case .spacer = cells[0], case .spacer = cells[1] else {
            Issue.record("expected two leading spacers")
            return
        }
        guard case let .day(number, date) = cells[2] else {
            Issue.record("expected day cell at index 2")
            return
        }
        #expect(number == 1)
        #expect(date == "2026-07-01")
        guard case let .day(lastNumber, lastDate) = cells[cells.count - 1] else {
            Issue.record("expected day cell at the end")
            return
        }
        #expect(lastNumber == 31)
        #expect(lastDate == "2026-07-31")
    }

    @Test("Month starting on Monday has no spacers")
    func mondayStartNoSpacers() throws {
        // 2026-06-01 is a Monday
        let june = try #require(DateFormatting.date(from: "2026-06-01"))
        let cells = CalendarGrid.cells(for: june)

        #expect(cells.count == 30)
        guard case let .day(number, date) = cells[0] else {
            Issue.record("expected day cell first")
            return
        }
        #expect(number == 1)
        #expect(date == "2026-06-01")
    }

    @Test("Cell IDs are unique within and across adjacent months")
    func uniqueIds() throws {
        let june = try #require(DateFormatting.date(from: "2026-06-15"))
        let july = try #require(DateFormatting.date(from: "2026-07-15"))
        let ids = (CalendarGrid.cells(for: june) + CalendarGrid.cells(for: july)).map(\.id)
        #expect(Set(ids).count == ids.count)
    }
}

@Suite("Calendar Stats Contract Tests")
struct CalendarStatsContractTests {
    @Test("CalendarResponse decodes the server's days map")
    func decodesServerPayload() throws {
        let json = """
        {"days":{"2026-07-01":{"calories":1830,"hasEntries":true},"2026-07-02":{"calories":2210,"hasEntries":true}}}
        """
        let response = try JSONDecoder().decode(CalendarResponse.self, from: Data(json.utf8))
        #expect(response.days.count == 2)
        #expect(response.days["2026-07-01"]?.calories == 1830)
        #expect(response.days["2026-07-02"]?.hasEntries == true)
    }

    @Test("CalendarDay.days merges goal and sorts by date")
    func mapsWireDaysWithGoal() {
        let wire = [
            "2026-07-02": CalendarDayData(calories: 2210, hasEntries: true),
            "2026-07-01": CalendarDayData(calories: 1830, hasEntries: true),
        ]
        let days = CalendarDay.days(from: wire, calorieGoal: 2000)

        #expect(days.map(\.date) == ["2026-07-01", "2026-07-02"])
        #expect(days[0].metGoal)
        #expect(days[0].hasGoal)
        #expect(!days[1].metGoal)
    }

    @Test("CalendarDay.days without goal never reports metGoal")
    func mapsWireDaysWithoutGoal() {
        let wire = ["2026-07-01": CalendarDayData(calories: 1830, hasEntries: true)]
        let days = CalendarDay.days(from: wire, calorieGoal: nil)

        #expect(!days[0].hasGoal)
        #expect(!days[0].metGoal)
    }
}
