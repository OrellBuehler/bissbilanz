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

@Suite("Entry Recipe Tests")
struct EntryRecipeTests {
    @Test("Entry with recipe uses recipe macros")
    func entryWithRecipe() {
        let recipe = Recipe(
            id: "r1", userId: "u1", name: "Oatmeal Bowl",
            totalServings: 2, isFavorite: false, imageUrl: nil,
            calories: 350, protein: 12, carbs: 55, fat: 8, fiber: 7,
            createdAt: nil, updatedAt: nil, ingredients: nil
        )
        let entry = Entry(
            id: "e1", userId: "u1", foodId: nil, recipeId: "r1",
            date: "2026-03-12", mealType: "breakfast", servings: 2,
            notes: nil, quickName: nil, quickCalories: nil,
            quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: nil, recipe: recipe
        )

        #expect(entry.displayName == "Oatmeal Bowl")
        #expect(entry.totalCalories == 700) // 350 * 2
        #expect(entry.totalProtein == 24) // 12 * 2
        #expect(entry.totalCarbs == 110) // 55 * 2
        #expect(entry.totalFat == 16) // 8 * 2
        #expect(entry.totalFiber == 14) // 7 * 2
    }

    @Test("Entry with recipe nil macros falls back to zero")
    func entryWithRecipeNilMacros() {
        let recipe = Recipe(
            id: "r1", userId: "u1", name: "Simple Recipe",
            totalServings: 1, isFavorite: false, imageUrl: nil,
            calories: nil, protein: nil, carbs: nil, fat: nil, fiber: nil,
            createdAt: nil, updatedAt: nil, ingredients: nil
        )
        let entry = Entry(
            id: "e1", userId: "u1", foodId: nil, recipeId: "r1",
            date: "2026-03-12", mealType: "lunch", servings: 1,
            notes: nil, quickName: nil, quickCalories: nil,
            quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: nil, recipe: recipe
        )

        #expect(entry.totalCalories == 0)
        #expect(entry.totalProtein == 0)
    }

    @Test("Entry prefers food over recipe when both present")
    func entryPrefersFoodOverRecipe() {
        let food = makeFood(id: "f1", name: "Apple", calories: 95)
        let recipe = Recipe(
            id: "r1", userId: "u1", name: "Apple Pie",
            totalServings: 1, isFavorite: false, imageUrl: nil,
            calories: 300, protein: 5, carbs: 45, fat: 12, fiber: 3,
            createdAt: nil, updatedAt: nil, ingredients: nil
        )
        let entry = Entry(
            id: "e1", userId: "u1", foodId: "f1", recipeId: "r1",
            date: "2026-03-12", mealType: "snacks", servings: 1,
            notes: nil, quickName: nil, quickCalories: nil,
            quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: food, recipe: recipe
        )

        #expect(entry.displayName == "Apple")
        #expect(entry.totalCalories == 95)
    }
}

@Suite("Entry Display Name Fallback Tests")
struct EntryDisplayNameTests {
    @Test("Display name falls back to Unknown when no food/recipe/quick")
    func displayNameFallback() {
        let entry = Entry(
            id: "e1", userId: "u1", foodId: nil, recipeId: nil,
            date: "2026-03-12", mealType: "snacks", servings: 1,
            notes: nil, quickName: nil, quickCalories: nil,
            quickProtein: nil, quickCarbs: nil, quickFat: nil, quickFiber: nil,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: nil, recipe: nil
        )

        #expect(entry.displayName == "Unknown")
    }

    @Test("Quick entry with nil quick macros uses zero")
    func quickEntryNilMacros() {
        let entry = Entry(
            id: "e1", userId: "u1", foodId: nil, recipeId: nil,
            date: "2026-03-12", mealType: "snacks", servings: 2,
            notes: nil, quickName: "Mystery Snack",
            quickCalories: nil, quickProtein: nil,
            quickCarbs: nil, quickFat: nil, quickFiber: nil,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: nil, recipe: nil
        )

        #expect(entry.totalCalories == 0)
        #expect(entry.totalProtein == 0)
    }

    @Test("Quick entry servings multiply quick values")
    func quickEntryServingsMultiply() {
        let entry = Entry(
            id: "e1", userId: "u1", foodId: nil, recipeId: nil,
            date: "2026-03-12", mealType: "snacks", servings: 3,
            notes: nil, quickName: "Protein Bar",
            quickCalories: 200, quickProtein: 20,
            quickCarbs: 25, quickFat: 8, quickFiber: 3,
            eatenAt: nil, createdAt: nil, updatedAt: nil,
            food: nil, recipe: nil
        )

        #expect(entry.totalCalories == 600)
        #expect(entry.totalProtein == 60)
        #expect(entry.totalCarbs == 75)
        #expect(entry.totalFat == 24)
        #expect(entry.totalFiber == 9)
    }
}

@Suite("Food Nutrient Groups Tests")
struct FoodNutrientGroupsTests {
    @Test("Food with no optional nutrients has empty groups")
    func foodNoOptionalNutrients() {
        let food = makeFood(id: "1", name: "Simple")
        #expect(food.fatBreakdownNutrients.isEmpty)
        #expect(food.sugarCarbNutrients.isEmpty)
        #expect(food.mineralNutrients.isEmpty)
        #expect(food.vitaminNutrients.isEmpty)
        #expect(food.otherNutrients.isEmpty)
    }

    @Test("Fat breakdown includes correct nutrients and units")
    func fatBreakdownUnits() {
        let food = Food(
            id: "1", userId: "u1", name: "Oil", brand: nil,
            servingSize: 15, servingUnit: .ml,
            calories: 120, protein: 0, carbs: 0, fat: 14, fiber: 0,
            saturatedFat: 2, monounsaturatedFat: 10, polyunsaturatedFat: 1.5,
            transFat: nil, cholesterol: 0, omega3: 0.1, omega6: 1.4,
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

        #expect(food.fatBreakdownNutrients.count == 5) // sat, mono, poly, chol, omega3, omega6
        let names = food.fatBreakdownNutrients.map(\.0)
        #expect(names.contains("Saturated Fat"))
        #expect(names.contains("Omega-3"))
        #expect(!names.contains("Trans Fat")) // nil
    }

    @Test("Mineral nutrients use correct units")
    func mineralUnits() {
        let food = Food(
            id: "1", userId: "u1", name: "Mineral Water", brand: nil,
            servingSize: 500, servingUnit: .ml,
            calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
            saturatedFat: nil, monounsaturatedFat: nil, polyunsaturatedFat: nil,
            transFat: nil, cholesterol: nil, omega3: nil, omega6: nil,
            sugar: nil, addedSugars: nil, sugarAlcohols: nil, starch: nil,
            sodium: 10, potassium: nil, calcium: 50, iron: nil,
            magnesium: 20, phosphorus: nil, zinc: nil, copper: nil,
            manganese: nil, selenium: 5, iodine: nil, fluoride: nil,
            chromium: nil, molybdenum: nil, chloride: nil,
            vitaminA: nil, vitaminC: nil, vitaminD: nil, vitaminE: nil,
            vitaminK: nil, vitaminB1: nil, vitaminB2: nil, vitaminB3: nil,
            vitaminB5: nil, vitaminB6: nil, vitaminB7: nil, vitaminB9: nil,
            vitaminB12: nil, caffeine: nil, alcohol: nil, water: nil, salt: nil,
            barcode: nil, isFavorite: false, nutriScore: nil, novaGroup: nil,
            additives: nil, ingredientsText: nil, imageUrl: nil,
            createdAt: nil, updatedAt: nil
        )

        #expect(food.mineralNutrients.count == 4) // sodium, calcium, magnesium, selenium

        let sodiumEntry = food.mineralNutrients.first(where: { $0.0 == "Sodium" })
        #expect(sodiumEntry?.2 == "mg")

        let seleniumEntry = food.mineralNutrients.first(where: { $0.0 == "Selenium" })
        #expect(seleniumEntry?.2 == "\u{00B5}g")
    }
}

@Suite("Recipe Model Tests")
struct RecipeModelTests {
    @Test("Recipe equality based on id")
    func recipeEquality() {
        let r1 = Recipe(id: "r1", userId: "u1", name: "A", totalServings: 1, isFavorite: false, imageUrl: nil, calories: 100, protein: 5, carbs: 10, fat: 3, fiber: 2, createdAt: nil, updatedAt: nil, ingredients: nil)
        let r2 = Recipe(id: "r1", userId: "u1", name: "B", totalServings: 2, isFavorite: true, imageUrl: nil, calories: 200, protein: 10, carbs: 20, fat: 6, fiber: 4, createdAt: nil, updatedAt: nil, ingredients: nil)
        let r3 = Recipe(id: "r2", userId: "u1", name: "A", totalServings: 1, isFavorite: false, imageUrl: nil, calories: 100, protein: 5, carbs: 10, fat: 3, fiber: 2, createdAt: nil, updatedAt: nil, ingredients: nil)

        #expect(r1 == r2)
        #expect(r1 != r3)
    }

    @Test("Recipe hashable uses id")
    func recipeHashable() {
        let r1 = Recipe(id: "r1", userId: "u1", name: "A", totalServings: 1, isFavorite: false, imageUrl: nil, calories: nil, protein: nil, carbs: nil, fat: nil, fiber: nil, createdAt: nil, updatedAt: nil, ingredients: nil)
        let r2 = Recipe(id: "r1", userId: "u1", name: "B", totalServings: 2, isFavorite: true, imageUrl: nil, calories: nil, protein: nil, carbs: nil, fat: nil, fiber: nil, createdAt: nil, updatedAt: nil, ingredients: nil)

        var set = Set<Recipe>()
        set.insert(r1)
        set.insert(r2)
        #expect(set.count == 1)
    }
}

@Suite("Supplement Model Tests")
struct SupplementModelTests {
    @Test("SupplementChecklist id uses supplement id")
    func supplementChecklistId() {
        let supplement = Supplement(
            id: "s1", userId: "u1", name: "Vitamin D",
            dosage: 4000, dosageUnit: "IU",
            scheduleType: .daily, scheduleDays: nil,
            scheduleStartDate: nil, isActive: true, sortOrder: 0,
            timeOfDay: "morning", createdAt: nil, updatedAt: nil,
            ingredients: nil
        )
        let checklist = SupplementChecklist(supplement: supplement, taken: false, log: nil)
        #expect(checklist.id == "s1")
    }

    @Test("SupplementHistoryItem id uses supplement id")
    func supplementHistoryItemId() {
        let supplement = Supplement(
            id: "s2", userId: "u1", name: "Omega-3",
            dosage: 1000, dosageUnit: "mg",
            scheduleType: .daily, scheduleDays: nil,
            scheduleStartDate: nil, isActive: true, sortOrder: 1,
            timeOfDay: nil, createdAt: nil, updatedAt: nil,
            ingredients: nil
        )
        let item = SupplementHistoryItem(supplement: supplement, taken: true, log: nil)
        #expect(item.id == "s2")
    }

    @Test("SupplementHistoryEntry id uses date")
    func supplementHistoryEntryId() {
        let entry = SupplementHistoryEntry(date: "2026-03-12", supplements: [])
        #expect(entry.id == "2026-03-12")
    }
}

@Suite("TopFoodEntry ID Tests")
struct TopFoodEntryTests {
    @Test("TopFoodEntry id uses foodId when present")
    func topFoodEntryFoodId() {
        let entry = TopFoodEntry(
            foodId: "f1", recipeId: nil, foodName: "Apple",
            count: 5, calories: 475, protein: 1.5,
            carbs: 69, fat: 1.5, fiber: 12
        )
        #expect(entry.id == "f1")
    }

    @Test("TopFoodEntry id uses recipeId when no foodId")
    func topFoodEntryRecipeId() {
        let entry = TopFoodEntry(
            foodId: nil, recipeId: "r1", foodName: "Pasta Dish",
            count: 3, calories: 1350, protein: 45,
            carbs: 180, fat: 36, fiber: 9
        )
        #expect(entry.id == "r1")
    }

    @Test("TopFoodEntry id falls back to foodName")
    func topFoodEntryNameFallback() {
        let entry = TopFoodEntry(
            foodId: nil, recipeId: nil, foodName: "Unknown Food",
            count: 1, calories: 100, protein: 5,
            carbs: 15, fat: 3, fiber: 2
        )
        #expect(entry.id == "Unknown Food")
    }
}

@Suite("Preferences Defaults Tests")
struct PreferencesDefaultsTests {
    @Test("Default preferences have expected values")
    func defaultPreferences() {
        let prefs = Preferences.defaults
        #expect(prefs.showChartWidget == true)
        #expect(prefs.showFavoritesWidget == true)
        #expect(prefs.showSupplementsWidget == true)
        #expect(prefs.showWeightWidget == true)
        #expect(prefs.startPage == "dashboard")
        #expect(prefs.favoriteTapAction == "instant")
        #expect(prefs.favoriteMealAssignmentMode == "time_based")
        #expect(prefs.visibleNutrients.isEmpty)
        #expect(prefs.locale == nil)
    }
}

@Suite("Weight Model Tests")
struct WeightModelTests {
    @Test("WeightEntry round-trip encoding")
    func weightEntryRoundTrip() throws {
        let entry = WeightEntry(
            id: "w1", userId: "u1", weightKg: 75.5,
            entryDate: "2026-03-12", loggedAt: "2026-03-12T08:00:00Z",
            notes: "Morning weight", createdAt: "2026-03-12T08:00:00Z",
            updatedAt: "2026-03-12T08:00:00Z"
        )

        let data = try JSONEncoder().encode(entry)
        let decoded = try JSONDecoder().decode(WeightEntry.self, from: data)

        #expect(decoded.id == "w1")
        #expect(decoded.weightKg == 75.5)
        #expect(decoded.entryDate == "2026-03-12")
        #expect(decoded.notes == "Morning weight")
    }

    @Test("WeightCreate with nil notes")
    func weightCreateNilNotes() throws {
        let create = WeightCreate(weightKg: 74.0, entryDate: "2026-03-13")

        let data = try JSONEncoder().encode(create)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["weightKg"] as? Double == 74.0)
        #expect(json["notes"] == nil)
    }
}

@Suite("AppLocale Tests")
struct AppLocaleTests {
    @Test("AppLocale display names")
    func localeDisplayNames() {
        #expect(AppLocale.en.displayName == "English")
        #expect(AppLocale.de.displayName == "Deutsch")
    }

    @Test("AppLocale all cases")
    func localeAllCases() {
        #expect(AppLocale.allCases.count == 2)
    }

    @Test("AppLocale raw values")
    func localeRawValues() {
        #expect(AppLocale.en.rawValue == "en")
        #expect(AppLocale.de.rawValue == "de")
    }
}

@Suite("FavoriteMealTimeframe Tests")
struct FavoriteMealTimeframeTests {
    @Test("FavoriteMealTimeframe round-trip encoding")
    func timeframeRoundTrip() throws {
        let timeframe = FavoriteMealTimeframe(
            mealType: "breakfast",
            startTime: "06:00",
            endTime: "10:00"
        )

        let data = try JSONEncoder().encode(timeframe)
        let decoded = try JSONDecoder().decode(FavoriteMealTimeframe.self, from: data)

        #expect(decoded.mealType == "breakfast")
        #expect(decoded.startTime == "06:00")
        #expect(decoded.endTime == "10:00")
    }
}

@Suite("MealType Model Tests")
struct MealTypeModelTests {
    @Test("MealType round-trip encoding")
    func mealTypeRoundTrip() throws {
        let mealType = MealType(
            id: "mt1", userId: "u1", name: "Pre-Workout",
            sortOrder: 4, createdAt: "2026-03-12T10:00:00Z"
        )

        let data = try JSONEncoder().encode(mealType)
        let decoded = try JSONDecoder().decode(MealType.self, from: data)

        #expect(decoded.id == "mt1")
        #expect(decoded.name == "Pre-Workout")
        #expect(decoded.sortOrder == 4)
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
