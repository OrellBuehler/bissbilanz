@testable import Bissbilanz
import Foundation
import Testing

@Suite("DateFormatting Tests")
struct DateFormattingTests {
    @Test("Day labels describe neighboring days, including across midnight")
    func relativeDayLabels() throws {
        let now = try #require(DateFormatting.date(from: "2026-09-10"))
        #expect(L10n.dayLabel(now, now: now) == L10n.today)
        #expect(L10n.dayLabel(now.adding(days: -1), now: now) == L10n.yesterday)
        #expect(L10n.dayLabel(now.adding(days: 1), now: now) == L10n.tomorrow)
        #expect(L10n.dayLabel(now.adding(days: -2), now: now) == DateFormatting
            .displayString(from: now.adding(days: -2)))
    }

    @Test("ISO string format is yyyy-MM-dd")
    func isoStringFormat() throws {
        let components = DateComponents(year: 2026, month: 3, day: 12)
        let date = try #require(Calendar.current.date(from: components))

        let result = DateFormatting.isoString(from: date)
        #expect(result == "2026-03-12")
    }

    @Test("Parse ISO string back to date")
    func parseISOString() throws {
        let date = DateFormatting.date(from: "2026-03-12")
        #expect(date != nil)

        let components = try Calendar.current.dateComponents([.year, .month, .day], from: #require(date))
        #expect(components.year == 2026)
        #expect(components.month == 3)
        #expect(components.day == 12)
    }

    @Test("Invalid ISO string returns nil")
    func invalidISOString() {
        #expect(DateFormatting.date(from: "not-a-date") == nil)
        #expect(DateFormatting.date(from: "") == nil)
        #expect(DateFormatting.date(from: "2026/03/12") == nil)
    }

    @Test("Today returns current date in ISO format")
    func todayFormat() throws {
        let today = DateFormatting.today
        #expect(today.count == 10)
        #expect(today.contains("-"))

        let parsed = DateFormatting.date(from: today)
        #expect(parsed != nil)
        #expect(try Calendar.current.isDateInToday(#require(parsed)))
    }

    @Test("Round-trip ISO formatting")
    func roundTrip() throws {
        let original = "2026-01-15"
        let date = try #require(DateFormatting.date(from: original))
        let result = DateFormatting.isoString(from: date)
        #expect(result == original)
    }
}

@Suite("Date Extension Tests")
struct DateExtensionTests {
    @Test("isoDateString returns formatted string")
    func isoDateString() throws {
        let components = DateComponents(year: 2026, month: 6, day: 1)
        let date = try #require(Calendar.current.date(from: components))
        #expect(date.isoDateString == "2026-06-01")
    }

    @Test("Adding days works correctly")
    func addingDays() throws {
        let components = DateComponents(year: 2026, month: 3, day: 10)
        let date = try #require(Calendar.current.date(from: components))

        let tomorrow = date.adding(days: 1)
        #expect(tomorrow.isoDateString == "2026-03-11")

        let yesterday = date.adding(days: -1)
        #expect(yesterday.isoDateString == "2026-03-09")

        let nextWeek = date.adding(days: 7)
        #expect(nextWeek.isoDateString == "2026-03-17")
    }

    @Test("Adding months works correctly")
    func addingMonths() throws {
        let components = DateComponents(year: 2026, month: 1, day: 15)
        let date = try #require(Calendar.current.date(from: components))

        let nextMonth = date.adding(months: 1)
        let nextComponents = Calendar.current.dateComponents([.year, .month], from: nextMonth)
        #expect(nextComponents.month == 2)

        let prevMonth = date.adding(months: -1)
        let prevComponents = Calendar.current.dateComponents([.year, .month], from: prevMonth)
        #expect(prevComponents.month == 12)
        #expect(prevComponents.year == 2025)
    }

    @Test("isToday returns true for current date")
    func isToday() {
        #expect(Date().isToday)
        #expect(!Date().adding(days: -1).isToday)
        #expect(!Date().adding(days: 1).isToday)
    }

    @Test("startOfMonth returns first day")
    func startOfMonth() throws {
        let components = DateComponents(year: 2026, month: 3, day: 15)
        let date = try #require(Calendar.current.date(from: components))
        let start = date.startOfMonth

        let startComponents = Calendar.current.dateComponents([.year, .month, .day], from: start)
        #expect(startComponents.year == 2026)
        #expect(startComponents.month == 3)
        #expect(startComponents.day == 1)
    }

    @Test("daysInMonth returns correct count")
    func daysInMonth() throws {
        let feb2026 = try #require(Calendar.current.date(from: DateComponents(year: 2026, month: 2, day: 1)))
        #expect(feb2026.daysInMonth == 28)

        let mar2026 = try #require(Calendar.current.date(from: DateComponents(year: 2026, month: 3, day: 1)))
        #expect(mar2026.daysInMonth == 31)

        let apr2026 = try #require(Calendar.current.date(from: DateComponents(year: 2026, month: 4, day: 1)))
        #expect(apr2026.daysInMonth == 30)
    }
}

/// `L10n.currentLocale` is process-global (UserDefaults-backed), so every
/// test that touches it lives in this single `.serialized` suite — spread
/// across parallel suites they race and read each other's locale.
@Suite("Localization Tests", .serialized)
struct LocalizationTests {
    @Test("Meal names map correctly")
    func mealNames() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        #expect(L10n.mealName("breakfast") == "Breakfast")
        #expect(L10n.mealName("lunch") == "Lunch")
        #expect(L10n.mealName("dinner") == "Dinner")
        #expect(L10n.mealName("snacks") == "Snacks")
        #expect(L10n.mealName("custom") == "Custom")
    }

    @Test("German locale returns German strings")
    func germanLocale() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .de
        defer { L10n.currentLocale = savedLocale }

        #expect(L10n.calories == "Kalorien")
        #expect(L10n.protein == "Eiweiß")
        #expect(L10n.settings == "Einstellungen")
        #expect(L10n.mealName("breakfast") == "Frühstück")
    }

    @Test("English locale returns English strings")
    func englishLocale() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        #expect(L10n.calories == "Calories")
        #expect(L10n.protein == "Protein")
        #expect(L10n.settings == "Settings")
    }

    @Test("Meal name handles case-insensitive input")
    func mealNameCaseInsensitive() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        #expect(L10n.mealName("BREAKFAST") == "Breakfast")
        #expect(L10n.mealName("Lunch") == "Lunch")
        #expect(L10n.mealName("DINNER") == "Dinner")
    }

    @Test("Snack alias maps to Snacks")
    func snackAlias() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        #expect(L10n.mealName("snack") == "Snacks")
        #expect(L10n.mealName("snacks") == "Snacks")
    }

    @Test("Unknown meal type returns capitalized")
    func unknownMealCapitalized() {
        // `.capitalized` uppercases after hyphens too ("Pre-Workout").
        #expect(L10n.mealName("pre-workout") == "Pre-Workout")
        #expect(L10n.mealName("brunch") == "Brunch")
    }

    @Test("NOVA group descriptions")
    func novaGroupDescriptions() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        #expect(L10n.novaGroupDescription(1) == "Unprocessed")
        #expect(L10n.novaGroupDescription(2) == "Processed ingredients")
        #expect(L10n.novaGroupDescription(3) == "Processed")
        #expect(L10n.novaGroupDescription(4) == "Ultra-processed")
        #expect(L10n.novaGroupDescription(0) == "Unknown")
        #expect(L10n.novaGroupDescription(5) == "Unknown")
    }

    @Test("Weekday headers differ by locale")
    func weekdayHeaders() {
        let savedLocale = L10n.currentLocale
        defer { L10n.currentLocale = savedLocale }

        L10n.currentLocale = .en
        let enHeaders = L10n.weekdayHeaders
        #expect(enHeaders.count == 7)
        #expect(enHeaders[0] == "M")
        #expect(enHeaders[2] == "W") // Wednesday

        L10n.currentLocale = .de
        let deHeaders = L10n.weekdayHeaders
        #expect(deHeaders[2] == "M") // Mittwoch
    }

    @Test("Entries copied interpolation")
    func entriesCopiedMessage() {
        let savedLocale = L10n.currentLocale
        defer { L10n.currentLocale = savedLocale }

        L10n.currentLocale = .en
        #expect(L10n.entriesCopied(3) == "3 entries copied")

        L10n.currentLocale = .de
        #expect(L10n.entriesCopied(3) == "3 Einträge kopiert")
    }

    @Test("Macro spoken summary reads calories then each macro in grams")
    func macroSpokenSummaryEnglish() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        let summary = MacroSpokenSummary.macros(calories: 34, protein: 2, carbs: 6.4, fat: 0.2)
        #expect(summary == "34 calories, Protein 2 grams, Carbs 6 grams, Fat 0 grams")
    }

    @Test("Macro spoken summary includes fiber when provided")
    func macroSpokenSummaryWithFiber() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        let summary = MacroSpokenSummary.macros(calories: 100, protein: 5, carbs: 20, fat: 3, fiber: 4)
        #expect(summary == "100 calories, Protein 5 grams, Carbs 20 grams, Fat 3 grams, Fiber 4 grams")
    }

    @Test("Macro spoken summary rounds fractional grams")
    func macroSpokenSummaryRounding() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        let summary = MacroSpokenSummary.macros(calories: 49.6, protein: 2.5, carbs: 0.4, fat: 8.9)
        #expect(summary == "50 calories, Protein 3 grams, Carbs 0 grams, Fat 9 grams")
    }

    @Test("Macro spoken summary in German")
    func macroSpokenSummaryGerman() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .de
        defer { L10n.currentLocale = savedLocale }

        let summary = MacroSpokenSummary.macros(calories: 34, protein: 2, carbs: 6, fat: 0)
        #expect(summary == "34 Kalorien, Eiweiß 2 Gramm, Kohlenhydrate 6 Gramm, Fett 0 Gramm")
    }
}

@Suite("JSON Encoding Tests")
struct JSONEncodingTests {
    @Test("FoodCreate encodes correctly")
    func foodCreateEncoding() throws {
        let food = FoodCreate(
            name: "Test",
            servingSize: 100,
            servingUnit: .g,
            calories: 200,
            protein: 10,
            carbs: 25,
            fat: 8,
            fiber: 3,
            barcode: "123456"
        )

        let data = try JSONEncoder().encode(food)
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["name"] as? String == "Test")
        #expect(json["servingSize"] as? Double == 100)
        #expect(json["servingUnit"] as? String == "g")
        #expect(json["calories"] as? Double == 200)
        #expect(json["barcode"] as? String == "123456")
    }

    @Test("EntryCreate encodes correctly")
    func entryCreateEncoding() throws {
        let entry = EntryCreate(
            foodId: "food-1",
            mealType: "lunch",
            servings: 1.5,
            date: "2026-03-12"
        )

        let data = try JSONEncoder().encode(entry)
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["foodId"] as? String == "food-1")
        #expect(json["mealType"] as? String == "lunch")
        #expect(json["servings"] as? Double == 1.5)
        #expect(json["date"] as? String == "2026-03-12")
    }

    @Test("Goals round-trip encoding")
    func goalsRoundTrip() throws {
        let goals = Goals(
            calorieGoal: 2500,
            proteinGoal: 180,
            carbGoal: 300,
            fatGoal: 70,
            fiberGoal: 35,
            sodiumGoal: 2300,
            sugarGoal: nil
        )

        let data = try JSONEncoder().encode(goals)
        let decoded = try JSONDecoder().decode(Goals.self, from: data)

        #expect(decoded.calorieGoal == 2500)
        #expect(decoded.proteinGoal == 180)
        #expect(decoded.sodiumGoal == 2300)
        #expect(decoded.sugarGoal == nil)
    }

    @Test("ScheduleType decodes from snake_case")
    func scheduleTypeDecoding() throws {
        let json = """
        {"scheduleType": "every_other_day"}
        """.data(using: .utf8)!

        struct Wrapper: Codable {
            let scheduleType: ScheduleType
        }

        let decoded = try JSONDecoder().decode(Wrapper.self, from: json)
        #expect(decoded.scheduleType == .everyOtherDay)
    }

    @Test("WeightCreate encodes correctly")
    func weightCreateEncoding() throws {
        let weight = WeightCreate(
            weightKg: 75.5,
            entryDate: "2026-03-12",
            notes: "After workout"
        )

        let data = try JSONEncoder().encode(weight)
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["weightKg"] as? Double == 75.5)
        #expect(json["entryDate"] as? String == "2026-03-12")
        #expect(json["notes"] as? String == "After workout")
    }
}

@Suite("Eaten-At Combining Tests")
struct EatenAtStringTests {
    /// Fixed to UTC so the wire string the formatter produces is the same
    /// wall-clock time the components describe, whatever zone the runner is in.
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar
    }

    private func date(_ components: DateComponents) throws -> Date {
        try #require(utc.date(from: components))
    }

    @Test("Picked time lands on the picked day, seconds zeroed")
    func combinesTimeOntoDay() throws {
        let day = try date(DateComponents(year: 2026, month: 3, day: 12))
        let time = try date(DateComponents(year: 1999, month: 1, day: 1, hour: 14, minute: 37, second: 52))

        let result = DateFormatting.eatenAtString(time: time, on: day, calendar: utc)
        #expect(result == "2026-03-12T14:37:00Z")
    }

    @Test("The day's own time of day is replaced, not added to")
    func dayTimeOfDayIsReplaced() throws {
        let day = try date(DateComponents(year: 2026, month: 3, day: 12, hour: 23, minute: 59))
        let time = try date(DateComponents(year: 2026, month: 9, day: 1, hour: 5, minute: 5))

        let result = DateFormatting.eatenAtString(time: time, on: day, calendar: utc)
        #expect(result == "2026-03-12T05:05:00Z")
    }

    @Test("Midnight stays on the picked day")
    func midnightKeepsTheDay() throws {
        let day = try date(DateComponents(year: 2026, month: 12, day: 31, hour: 18))
        let time = try date(DateComponents(year: 2020, month: 1, day: 1, hour: 0, minute: 0))

        let result = DateFormatting.eatenAtString(time: time, on: day, calendar: utc)
        #expect(result == "2026-12-31T00:00:00Z")
    }

    @Test("Result parses back to the same instant")
    func roundTripsThroughTheParser() throws {
        let day = try date(DateComponents(year: 2026, month: 6, day: 1))
        let time = try date(DateComponents(year: 2026, month: 6, day: 1, hour: 7, minute: 8))

        let result = try #require(DateFormatting.eatenAtString(time: time, on: day, calendar: utc))
        let parsed = try #require(DateFormatting.isoDateTime(from: result))
        let components = utc.dateComponents([.hour, .minute, .second], from: parsed)
        #expect(components.hour == 7)
        #expect(components.minute == 8)
        #expect(components.second == 0)
    }
}
