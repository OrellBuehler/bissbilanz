import Foundation
import Testing

@testable import Bissbilanz

@Suite("DateFormatting Tests")
struct DateFormattingTests {
    @Test("ISO string format is yyyy-MM-dd")
    func isoStringFormat() {
        let components = DateComponents(year: 2026, month: 3, day: 12)
        let date = Calendar.current.date(from: components)!

        let result = DateFormatting.isoString(from: date)
        #expect(result == "2026-03-12")
    }

    @Test("Parse ISO string back to date")
    func parseISOString() {
        let date = DateFormatting.date(from: "2026-03-12")
        #expect(date != nil)

        let components = Calendar.current.dateComponents([.year, .month, .day], from: date!)
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
    func todayFormat() {
        let today = DateFormatting.today
        #expect(today.count == 10)
        #expect(today.contains("-"))

        let parsed = DateFormatting.date(from: today)
        #expect(parsed != nil)
        #expect(Calendar.current.isDateInToday(parsed!))
    }

    @Test("Round-trip ISO formatting")
    func roundTrip() {
        let original = "2026-01-15"
        let date = DateFormatting.date(from: original)!
        let result = DateFormatting.isoString(from: date)
        #expect(result == original)
    }
}

@Suite("Date Extension Tests")
struct DateExtensionTests {
    @Test("isoDateString returns formatted string")
    func isoDateString() {
        let components = DateComponents(year: 2026, month: 6, day: 1)
        let date = Calendar.current.date(from: components)!
        #expect(date.isoDateString == "2026-06-01")
    }

    @Test("Adding days works correctly")
    func addingDays() {
        let components = DateComponents(year: 2026, month: 3, day: 10)
        let date = Calendar.current.date(from: components)!

        let tomorrow = date.adding(days: 1)
        #expect(tomorrow.isoDateString == "2026-03-11")

        let yesterday = date.adding(days: -1)
        #expect(yesterday.isoDateString == "2026-03-09")

        let nextWeek = date.adding(days: 7)
        #expect(nextWeek.isoDateString == "2026-03-17")
    }

    @Test("Adding months works correctly")
    func addingMonths() {
        let components = DateComponents(year: 2026, month: 1, day: 15)
        let date = Calendar.current.date(from: components)!

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
    func startOfMonth() {
        let components = DateComponents(year: 2026, month: 3, day: 15)
        let date = Calendar.current.date(from: components)!
        let start = date.startOfMonth

        let startComponents = Calendar.current.dateComponents([.year, .month, .day], from: start)
        #expect(startComponents.year == 2026)
        #expect(startComponents.month == 3)
        #expect(startComponents.day == 1)
    }

    @Test("daysInMonth returns correct count")
    func daysInMonth() {
        let feb2026 = Calendar.current.date(from: DateComponents(year: 2026, month: 2, day: 1))!
        #expect(feb2026.daysInMonth == 28)

        let mar2026 = Calendar.current.date(from: DateComponents(year: 2026, month: 3, day: 1))!
        #expect(mar2026.daysInMonth == 31)

        let apr2026 = Calendar.current.date(from: DateComponents(year: 2026, month: 4, day: 1))!
        #expect(apr2026.daysInMonth == 30)
    }
}

@Suite("Localization Tests")
struct LocalizationTests {
    @Test("Meal names map correctly")
    func mealNames() {
        L10n.currentLocale = .en
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
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

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
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

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
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["weightKg"] as? Double == 75.5)
        #expect(json["entryDate"] as? String == "2026-03-12")
        #expect(json["notes"] as? String == "After workout")
    }
}
