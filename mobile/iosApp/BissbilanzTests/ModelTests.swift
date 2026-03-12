import Foundation
import Testing

@testable import Bissbilanz

@Suite("Food Model Tests")
struct FoodModelTests {
    @Test("Food nutrients computed properties filter nil values")
    func foodNutrientProperties() {
        let food = Food(
            id: "1", userId: "u1", name: "Test Food", brand: "Brand",
            servingSize: 100, servingUnit: .g,
            calories: 200, protein: 10, carbs: 25, fat: 8, fiber: 3,
            saturatedFat: 2.5, monounsaturatedFat: nil, polyunsaturatedFat: nil,
            transFat: 0.1, cholesterol: nil, omega3: nil, omega6: nil,
            sugar: 5, addedSugars: nil, sugarAlcohols: nil, starch: nil,
            sodium: 100, potassium: nil, calcium: 50, iron: nil,
            magnesium: nil, phosphorus: nil, zinc: nil, copper: nil,
            manganese: nil, selenium: nil, iodine: nil, fluoride: nil,
            chromium: nil, molybdenum: nil, chloride: nil,
            vitaminA: nil, vitaminC: 10, vitaminD: nil, vitaminE: nil,
            vitaminK: nil, vitaminB1: nil, vitaminB2: nil, vitaminB3: nil,
            vitaminB5: nil, vitaminB6: nil, vitaminB7: nil, vitaminB9: nil,
            vitaminB12: nil, caffeine: nil, alcohol: nil, water: nil, salt: nil,
            barcode: nil, isFavorite: true, nutriScore: "b", novaGroup: 1,
            additives: nil, ingredientsText: nil, imageUrl: nil,
            createdAt: nil, updatedAt: nil
        )

        #expect(food.fatBreakdownNutrients.count == 2) // saturatedFat + transFat
        #expect(food.sugarCarbNutrients.count == 1) // sugar
        #expect(food.mineralNutrients.count == 2) // sodium + calcium
        #expect(food.vitaminNutrients.count == 1) // vitaminC
        #expect(food.otherNutrients.isEmpty)
    }

    @Test("Food equality based on id")
    func foodEquality() {
        let food1 = makeFood(id: "1", name: "Apple")
        let food2 = makeFood(id: "1", name: "Banana")
        let food3 = makeFood(id: "2", name: "Apple")

        #expect(food1 == food2)
        #expect(food1 != food3)
    }
}

@Suite("Entry Model Tests")
struct EntryModelTests {
    @Test("Entry total macros multiply by servings")
    func entryTotalMacros() {
        let food = makeFood(id: "1", name: "Rice", calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4)
        let entry = Entry(
            id: "e1", userId: "u1", foodId: "1", recipeId: nil,
            date: "2026-03-12", mealType: "lunch", servings: 2.5,
            notes: nil, quickName: nil, quickCalories: nil,
            quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: food, recipe: nil
        )

        #expect(entry.totalCalories == 325)
        #expect(entry.totalProtein == 6.75)
        #expect(entry.totalCarbs == 70)
        #expect(entry.totalFat == 0.75)
        #expect(entry.totalFiber == 1.0)
        #expect(entry.displayName == "Rice")
    }

    @Test("Quick entry uses quick values")
    func quickEntryMacros() {
        let entry = Entry(
            id: "e2", userId: "u1", foodId: nil, recipeId: nil,
            date: "2026-03-12", mealType: "snacks", servings: 1,
            notes: nil, quickName: "Protein Bar",
            quickCalories: 200, quickProtein: 20,
            quickCarbs: 25, quickFat: 8, quickFiber: 3,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: nil, recipe: nil
        )

        #expect(entry.displayName == "Protein Bar")
        #expect(entry.totalCalories == 200)
        #expect(entry.totalProtein == 20)
    }
}

@Suite("MacroTotals Tests")
struct MacroTotalsTests {
    @Test("Zero totals")
    func zeroTotals() {
        let totals = MacroTotals.zero
        #expect(totals.calories == 0)
        #expect(totals.protein == 0)
        #expect(totals.carbs == 0)
        #expect(totals.fat == 0)
        #expect(totals.fiber == 0)
    }
}

@Suite("Goals Tests")
struct GoalsTests {
    @Test("Default goals have expected values")
    func defaultGoals() {
        let goals = Goals.defaults
        #expect(goals.calorieGoal == 2000)
        #expect(goals.proteinGoal == 150)
        #expect(goals.carbGoal == 250)
        #expect(goals.fatGoal == 65)
        #expect(goals.fiberGoal == 30)
        #expect(goals.sodiumGoal == nil)
        #expect(goals.sugarGoal == nil)
    }
}

@Suite("ServingUnit Tests")
struct ServingUnitTests {
    @Test("Display names are correct")
    func displayNames() {
        #expect(ServingUnit.g.displayName == "g")
        #expect(ServingUnit.kg.displayName == "kg")
        #expect(ServingUnit.ml.displayName == "ml")
        #expect(ServingUnit.l.displayName == "L")
        #expect(ServingUnit.flOz.displayName == "fl oz")
        #expect(ServingUnit.cup.displayName == "cup")
    }

    @Test("All cases covered")
    func allCases() {
        #expect(ServingUnit.allCases.count == 10)
    }
}

@Suite("ScheduleType Tests")
struct ScheduleTypeTests {
    @Test("Raw values for JSON encoding")
    func rawValues() {
        #expect(ScheduleType.daily.rawValue == "daily")
        #expect(ScheduleType.everyOtherDay.rawValue == "every_other_day")
        #expect(ScheduleType.weekly.rawValue == "weekly")
        #expect(ScheduleType.specificDays.rawValue == "specific_days")
    }
}

// MARK: - Test Helpers

private func makeFood(
    id: String = "1",
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
