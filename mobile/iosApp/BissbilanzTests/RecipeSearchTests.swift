@testable import Bissbilanz
import Foundation
import Testing

@Suite("Recipe search and log defaults")
struct RecipeSearchTests {
    private static func recipe(id: String, name: String) -> Recipe {
        Recipe(
            id: id,
            userId: "u1",
            name: name,
            totalServings: 2,
            isFavorite: false,
            imageUrl: nil,
            calories: 400,
            protein: nil,
            carbs: nil,
            fat: nil,
            fiber: nil,
            cookedWeight: nil,
            createdAt: nil,
            updatedAt: nil,
            ingredients: nil
        )
    }

    private let recipes = [
        RecipeSearchTests.recipe(id: "r1", name: "Tomato Soup"),
        RecipeSearchTests.recipe(id: "r2", name: "Chicken Curry"),
        RecipeSearchTests.recipe(id: "r3", name: "Curry Noodles"),
    ]

    @Test("Matches by name, case-insensitive, sorted alphabetically")
    func matchesByName() {
        let result = RecipeSearch.matching(recipes, query: "curry")
        #expect(result.map(\.id) == ["r2", "r3"])
    }

    @Test("Empty or blank query matches nothing")
    func blankQueryMatchesNothing() {
        #expect(RecipeSearch.matching(recipes, query: "").isEmpty)
        #expect(RecipeSearch.matching(recipes, query: "   ").isEmpty)
    }

    @Test("Query without a hit returns nothing")
    func noHit() {
        #expect(RecipeSearch.matching(recipes, query: "pizza").isEmpty)
    }

    @Test("Morning time defaults to Breakfast, not Lunch")
    func morningDefaultsToBreakfast() throws {
        let components = DateComponents(year: 2026, month: 10, day: 6, hour: 8, minute: 26)
        let morning = try #require(Calendar.current.date(from: components))
        #expect(MealTiming.mealForCurrentTime(morning) == "Breakfast")
    }
}
