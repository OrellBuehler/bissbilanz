import Foundation
import Testing

@testable import Bissbilanz

// MARK: - Meal Grouping Logic
// Tests the meal ordering and grouping logic used in DashboardView.mealGroups

@Suite("Meal Grouping Tests")
struct MealGroupingTests {
    private func groupEntries(_ entries: [Entry]) -> [(String, [Entry])] {
        let grouped = Dictionary(grouping: entries, by: \.mealType)
        let order = ["breakfast", "lunch", "dinner", "snacks"]
        return order.compactMap { meal in
            guard let items = grouped[meal], !items.isEmpty else { return nil }
            return (meal, items)
        } + grouped.filter { !order.contains($0.key) }.sorted(by: { $0.key < $1.key }).map { ($0.key, $0.value) }
    }

    @Test("Standard meals appear in correct order")
    func standardMealOrder() {
        let entries = [
            makeEntry(mealType: "dinner"),
            makeEntry(mealType: "breakfast"),
            makeEntry(mealType: "snacks"),
            makeEntry(mealType: "lunch"),
        ]

        let groups = groupEntries(entries)
        #expect(groups.map(\.0) == ["breakfast", "lunch", "dinner", "snacks"])
    }

    @Test("Custom meals appear after standard meals")
    func customMealsAfterStandard() {
        let entries = [
            makeEntry(mealType: "pre-workout"),
            makeEntry(mealType: "breakfast"),
            makeEntry(mealType: "post-workout"),
        ]

        let groups = groupEntries(entries)
        #expect(groups.count == 3)
        #expect(groups[0].0 == "breakfast")
        #expect(groups[1].0 == "post-workout")
        #expect(groups[2].0 == "pre-workout")
    }

    @Test("Empty entries produce no groups")
    func emptyEntries() {
        let groups = groupEntries([])
        #expect(groups.isEmpty)
    }

    @Test("Missing standard meals are skipped")
    func missingMealsSkipped() {
        let entries = [
            makeEntry(mealType: "lunch"),
            makeEntry(mealType: "dinner"),
        ]

        let groups = groupEntries(entries)
        #expect(groups.count == 2)
        #expect(groups[0].0 == "lunch")
        #expect(groups[1].0 == "dinner")
    }

    @Test("Multiple entries per meal are grouped together")
    func multipleEntriesPerMeal() {
        let entries = [
            makeEntry(id: "e1", mealType: "breakfast"),
            makeEntry(id: "e2", mealType: "breakfast"),
            makeEntry(id: "e3", mealType: "lunch"),
        ]

        let groups = groupEntries(entries)
        #expect(groups.count == 2)
        #expect(groups[0].1.count == 2)
        #expect(groups[1].1.count == 1)
    }

    @Test("Only custom meals present")
    func onlyCustomMeals() {
        let entries = [
            makeEntry(mealType: "evening-snack"),
            makeEntry(mealType: "brunch"),
        ]

        let groups = groupEntries(entries)
        #expect(groups.count == 2)
        #expect(groups[0].0 == "brunch")
        #expect(groups[1].0 == "evening-snack")
    }

    @Test("Custom meals are sorted alphabetically")
    func customMealsSorted() {
        let entries = [
            makeEntry(mealType: "z-meal"),
            makeEntry(mealType: "a-meal"),
            makeEntry(mealType: "m-meal"),
        ]

        let groups = groupEntries(entries)
        #expect(groups.map(\.0) == ["a-meal", "m-meal", "z-meal"])
    }
}

// MARK: - Macro Totals Computation

@Suite("Entry Macro Totals Tests")
struct EntryMacroTotalsTests {
    private func computeTotals(_ entries: [Entry]) -> (calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double) {
        (
            entries.reduce(0) { $0 + $1.totalCalories },
            entries.reduce(0) { $0 + $1.totalProtein },
            entries.reduce(0) { $0 + $1.totalCarbs },
            entries.reduce(0) { $0 + $1.totalFat },
            entries.reduce(0) { $0 + $1.totalFiber }
        )
    }

    @Test("Empty entries sum to zero")
    func emptyEntriesTotals() {
        let totals = computeTotals([])
        #expect(totals.calories == 0)
        #expect(totals.protein == 0)
    }

    @Test("Single entry totals match entry")
    func singleEntryTotals() {
        let food = makeFoodHelper(calories: 200, protein: 15, carbs: 25, fat: 8, fiber: 3)
        let entry = makeEntry(food: food, servings: 1.5)
        let totals = computeTotals([entry])

        #expect(totals.calories == 300) // 200 * 1.5
        #expect(totals.protein == 22.5) // 15 * 1.5
    }

    @Test("Multiple entries sum correctly")
    func multipleEntriesTotals() {
        let food1 = makeFoodHelper(calories: 100, protein: 5, carbs: 15, fat: 3, fiber: 2)
        let food2 = makeFoodHelper(calories: 300, protein: 20, carbs: 35, fat: 12, fiber: 5)

        let entries = [
            makeEntry(id: "e1", food: food1, servings: 1),
            makeEntry(id: "e2", food: food2, servings: 2),
        ]
        let totals = computeTotals(entries)

        #expect(totals.calories == 700) // 100 + 600
        #expect(totals.protein == 45) // 5 + 40
    }

    @Test("Mixed food, recipe, and quick entries sum correctly")
    func mixedEntryTypes() {
        let food = makeFoodHelper(calories: 150, protein: 10, carbs: 20, fat: 5, fiber: 3)
        let recipe = Recipe(
            id: "r1", userId: "u1", name: "Smoothie",
            totalServings: 1, isFavorite: false, imageUrl: nil,
            calories: 280, protein: 15, carbs: 45, fat: 5, fiber: 6,
            createdAt: nil, updatedAt: nil, ingredients: nil
        )

        let entries = [
            makeEntry(id: "e1", food: food, servings: 1),
            Entry(
                id: "e2", userId: "u1", foodId: nil, recipeId: "r1",
                date: "2026-03-12", mealType: "lunch", servings: 1,
                notes: nil, quickName: nil, quickCalories: nil,
                quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
                eatenAt: nil, createdAt: nil, updatedAt: nil,
                food: nil, recipe: recipe
            ),
            Entry(
                id: "e3", userId: "u1", foodId: nil, recipeId: nil,
                date: "2026-03-12", mealType: "snacks", servings: 1,
                notes: nil, quickName: "Bar",
                quickCalories: 200, quickProtein: 20,
                quickCarbs: 25, quickFat: 8, quickFiber: 3,
                eatenAt: nil, createdAt: nil, updatedAt: nil,
                food: nil, recipe: nil
            ),
        ]
        let totals = computeTotals(entries)

        #expect(totals.calories == 630) // 150 + 280 + 200
        #expect(totals.protein == 45) // 10 + 15 + 20
    }
}

// MARK: - Date Navigation Logic

@Suite("Date Navigation Tests")
struct DateNavigationTests {
    @Test("Adding one day moves to next day")
    func nextDay() {
        let date = DateFormatting.date(from: "2026-03-12")!
        let next = date.adding(days: 1)
        #expect(next.isoDateString == "2026-03-13")
    }

    @Test("Subtracting one day moves to previous day")
    func previousDay() {
        let date = DateFormatting.date(from: "2026-03-12")!
        let prev = date.adding(days: -1)
        #expect(prev.isoDateString == "2026-03-11")
    }

    @Test("Navigation across month boundary")
    func crossMonthBoundary() {
        let date = DateFormatting.date(from: "2026-03-31")!
        let next = date.adding(days: 1)
        #expect(next.isoDateString == "2026-04-01")
    }

    @Test("Navigation across year boundary")
    func crossYearBoundary() {
        let date = DateFormatting.date(from: "2025-12-31")!
        let next = date.adding(days: 1)
        #expect(next.isoDateString == "2026-01-01")
    }

    @Test("Navigation through February leap year")
    func leapYearFebruary() {
        let date = DateFormatting.date(from: "2028-02-28")!
        let next = date.adding(days: 1)
        #expect(next.isoDateString == "2028-02-29") // 2028 is a leap year
    }

    @Test("Navigation through February non-leap year")
    func nonLeapYearFebruary() {
        let date = DateFormatting.date(from: "2026-02-28")!
        let next = date.adding(days: 1)
        #expect(next.isoDateString == "2026-03-01")
    }

    @Test("weekdayOffset returns Monday-based offset")
    func weekdayOffset() {
        // 2026-03-01 is a Sunday
        let march2026 = DateFormatting.date(from: "2026-03-01")!
        let offset = march2026.weekdayOffset
        #expect(offset == 6) // Sunday = 6 in Monday-based (Mon=0, Tue=1, ..., Sun=6)
    }
}

// MARK: - DateFormatting Additional Tests

@Suite("DateFormatting Display Tests")
struct DateFormattingDisplayTests {
    @Test("Display string is non-empty")
    func displayStringNotEmpty() {
        let date = DateFormatting.date(from: "2026-03-12")!
        let display = DateFormatting.displayString(from: date)
        #expect(!display.isEmpty)
    }

    @Test("Month year format")
    func monthYearFormat() {
        let date = DateFormatting.date(from: "2026-03-12")!
        let monthYear = DateFormatting.monthYear(from: date)
        #expect(monthYear.contains("2026"))
    }
}

// MARK: - Localization Logic Tests

@Suite("Localization Meal Name Tests")
struct LocalizationMealNameTests {
    @Test("Meal name handles case-insensitive input")
    func mealNameCaseInsensitive() {
        L10n.currentLocale = .en
        #expect(L10n.mealName("BREAKFAST") == "Breakfast")
        #expect(L10n.mealName("Lunch") == "Lunch")
        #expect(L10n.mealName("DINNER") == "Dinner")
    }

    @Test("Snack alias maps to Snacks")
    func snackAlias() {
        L10n.currentLocale = .en
        #expect(L10n.mealName("snack") == "Snacks")
        #expect(L10n.mealName("snacks") == "Snacks")
    }

    @Test("Unknown meal type returns capitalized")
    func unknownMealCapitalized() {
        #expect(L10n.mealName("pre-workout") == "Pre-workout")
        #expect(L10n.mealName("brunch") == "Brunch")
    }

    @Test("NOVA group descriptions")
    func novaGroupDescriptions() {
        L10n.currentLocale = .en
        #expect(L10n.novaGroupDescription(1) == "Unprocessed")
        #expect(L10n.novaGroupDescription(2) == "Processed ingredients")
        #expect(L10n.novaGroupDescription(3) == "Processed")
        #expect(L10n.novaGroupDescription(4) == "Ultra-processed")
        #expect(L10n.novaGroupDescription(0) == "Unknown")
        #expect(L10n.novaGroupDescription(5) == "Unknown")
    }

    @Test("Weekday headers differ by locale")
    func weekdayHeaders() {
        let saved = L10n.currentLocale
        defer { L10n.currentLocale = saved }

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
        let saved = L10n.currentLocale
        defer { L10n.currentLocale = saved }

        L10n.currentLocale = .en
        #expect(L10n.entriesCopied(3) == "3 entries copied")

        L10n.currentLocale = .de
        #expect(L10n.entriesCopied(3) == "3 Einträge kopiert")
    }
}

// MARK: - Test Helpers

private func makeFoodHelper(
    id: String = "f1",
    name: String = "Test Food",
    calories: Double = 100,
    protein: Double = 5,
    carbs: Double = 15,
    fat: Double = 3,
    fiber: Double = 2
) -> Food {
    Food(
        id: id, userId: "u1", name: name, brand: nil,
        servingSize: 100, servingUnit: .g,
        calories: calories, protein: protein, carbs: carbs, fat: fat, fiber: fiber,
        saturatedFat: nil, monounsaturatedFat: nil, polyunsaturatedFat: nil,
        transFat: nil, cholesterol: nil, omega3: nil, omega6: nil,
        sugar: nil, addedSugars: nil, sugarAlcohols: nil, starch: nil,
        sodium: nil, potassium: nil, calcium: nil, iron: nil,
        magnesium: nil, phosphorus: nil, zinc: nil, copper: nil,
        manganese: nil, selenium: nil, iodine: nil, fluoride: nil,
        chromium: nil, molybdenum: nil, chloride: nil,
        vitaminA: nil, vitaminC: nil, vitaminD: nil, vitaminE: nil,
        vitaminK: nil, vitaminB1: nil, vitaminB2: nil, vitaminB3: nil,
        vitaminB5: nil, vitaminB6: nil, vitaminB7: nil, vitaminB9: nil,
        vitaminB12: nil, caffeine: nil, alcohol: nil, water: nil, salt: nil,
        barcode: nil, isFavorite: false, nutriScore: nil, novaGroup: nil,
        additives: nil, ingredientsText: nil, imageUrl: nil,
        createdAt: nil, updatedAt: nil
    )
}

private func makeEntry(
    id: String = "e1",
    mealType: String = "breakfast",
    food: Food? = nil,
    servings: Double = 1
) -> Entry {
    let f = food ?? makeFoodHelper()
    return Entry(
        id: id, userId: "u1", foodId: f.id, recipeId: nil,
        date: "2026-03-12", mealType: mealType, servings: servings,
        notes: nil, quickName: nil, quickCalories: nil,
        quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
        eatenAt: nil, createdAt: nil, updatedAt: nil,
        food: f, recipe: nil
    )
}
