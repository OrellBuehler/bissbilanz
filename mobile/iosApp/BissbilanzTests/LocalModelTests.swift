@testable import Bissbilanz
import Foundation
import Testing

/// JSON round-trips Local model ↔ Codable struct for every persisted entity.
/// The local models keep typed columns plus a `jsonData` payload; these tests
/// prove the payload is lossless and the typed columns mirror the struct.
struct LocalModelTests {
    @Test("LocalEntry round-trips and stamps the cache date")
    func localEntryRoundTrip() throws {
        let entry = try JSONPatch.decode(Entry.self, from: [
            "id": "e1",
            "mealType": "breakfast",
            "servings": 1.5,
            "foodId": "f1",
            "foodName": "Oats",
            "calories": 150,
            "protein": 5,
            "carbs": 27,
            "fat": 2.5,
            "fiber": 4,
            "servingSize": 40,
            "servingUnit": "g",
            "eatenAt": "2026-06-01T08:00:00.000Z",
        ])

        let local = LocalEntry(entry: entry, date: "2026-06-01")
        let restored = try #require(local.toEntry())

        #expect(local.id == "e1")
        #expect(local.date == "2026-06-01")
        #expect(local.foodName == "Oats")
        #expect(local.calories == 150)
        #expect(restored.id == "e1")
        #expect(restored.date == "2026-06-01") // injected — list responses omit it
        #expect(restored.foodName == "Oats")
        #expect(restored.servings == 1.5)
        #expect(restored.servingUnit == .g)
        #expect(restored.totalCalories == 225)
    }

    @Test("LocalFood round-trips including extended nutrients")
    func localFoodRoundTrip() throws {
        let food = try JSONPatch.decode(Food.self, from: [
            "id": "f1",
            "userId": "u1",
            "name": "Apple",
            "brand": "Organic",
            "servingSize": 182,
            "servingUnit": "g",
            "calories": 95,
            "protein": 0.5,
            "carbs": 25.1,
            "fat": 0.3,
            "fiber": 4.4,
            "sugar": 18.9,
            "vitaminC": 8.4,
            "barcode": "012345678901",
            "isFavorite": true,
            "nutriScore": "a",
            "novaGroup": 1,
            "additives": ["en:e300"],
        ])

        let local = LocalFood(food: food)
        let restored = try #require(local.toFood())

        #expect(local.id == "f1")
        #expect(local.isFavorite == true)
        #expect(local.barcode == "012345678901")
        #expect(restored.name == "Apple")
        #expect(restored.brand == "Organic")
        #expect(restored.sugar == 18.9)
        #expect(restored.vitaminC == 8.4)
        #expect(restored.nutriScore == "a")
        #expect(restored.novaGroup == 1)
        #expect(restored.additives == ["en:e300"])
    }

    @Test("LocalRecipe round-trips including ingredients")
    func localRecipeRoundTrip() throws {
        let recipe = try JSONPatch.decode(Recipe.self, from: [
            "id": "r1",
            "userId": "u1",
            "name": "Oatmeal Bowl",
            "totalServings": 2,
            "isFavorite": true,
            "calories": 350,
            "protein": 12,
            "carbs": 55,
            "fat": 8,
            "fiber": 7,
            "ingredients": [
                [
                    "id": "ri1",
                    "recipeId": "r1",
                    "foodId": "f1",
                    "quantity": 80,
                    "servingUnit": "g",
                    "sortOrder": 0,
                ],
            ],
        ])

        let local = LocalRecipe(recipe: recipe)
        let restored = try #require(local.toRecipe())

        #expect(local.id == "r1")
        #expect(local.isFavorite == true)
        #expect(local.totalServings == 2)
        #expect(restored.name == "Oatmeal Bowl")
        #expect(restored.calories == 350)
        #expect(restored.ingredients?.count == 1)
        #expect(restored.ingredients?.first?.foodId == "f1")
        #expect(restored.ingredients?.first?.quantity == 80)
    }

    @Test("LocalWeightEntry round-trips")
    func localWeightEntryRoundTrip() throws {
        let entry = try JSONPatch.decode(WeightEntry.self, from: [
            "id": "w1",
            "userId": "u1",
            "weightKg": 74.6,
            "entryDate": "2026-06-01",
            "loggedAt": "2026-06-01T07:30:00Z",
            "notes": "morning",
        ])

        let local = LocalWeightEntry(entry: entry)
        let restored = try #require(local.toWeightEntry())

        #expect(local.id == "w1")
        #expect(local.entryDate == "2026-06-01")
        #expect(local.weightKg == 74.6)
        #expect(restored.weightKg == 74.6)
        #expect(restored.notes == "morning")
        #expect(restored.loggedAt == "2026-06-01T07:30:00Z")
    }

    @Test("LocalSupplement round-trips including ingredients")
    func localSupplementRoundTrip() throws {
        let supplement = try JSONPatch.decode(Supplement.self, from: [
            "id": "s1",
            "userId": "u1",
            "name": "Vitamin D",
            "scheduleType": "specific_days",
            "scheduleDays": [1, 3, 5],
            "isActive": true,
            "sortOrder": 2,
            "timeOfDay": "morning",
            "ingredients": [
                [
                    "id": "i1",
                    "supplementId": "s1",
                    "foodId": "f1",
                    "servings": 1,
                    "sortOrder": 0,
                    "food": [
                        "id": "f1",
                        "name": "Vitamin D3",
                        "kind": "supplement",
                        "servingSize": 1,
                        "servingUnit": "piece",
                        "calories": 0,
                        "protein": 0,
                        "carbs": 0,
                        "fat": 0,
                        "fiber": 0,
                        "ingredientsText": "4000 IU",
                    ],
                ],
            ],
        ])

        let local = LocalSupplement(supplement: supplement)
        let restored = try #require(local.toSupplement())

        #expect(local.id == "s1")
        #expect(local.isActive == true)
        #expect(local.sortOrder == 2)
        #expect(restored.scheduleType == .specificDays)
        #expect(restored.scheduleDays == [1, 3, 5])
        #expect(restored.timeOfDay == "morning")
        #expect(restored.ingredients.first?.food.ingredientsText == "4000 IU")
    }

    @Test("LocalSupplementLog round-trips and uses the natural key")
    func localSupplementLogRoundTrip() throws {
        let log = SupplementLog(
            supplementId: "s1",
            date: "2026-06-01",
            takenAt: "2026-06-01T08:00:00Z",
            entryIds: ["e1", "e2"]
        )

        let local = LocalSupplementLog(log: log)
        let restored = try #require(local.toSupplementLog())

        #expect(local.id == "s1-2026-06-01")
        #expect(local.supplementId == "s1")
        #expect(local.date == "2026-06-01")
        #expect(local.takenAt == "2026-06-01T08:00:00Z")
        #expect(restored.supplementId == "s1")
        #expect(restored.entryIds == ["e1", "e2"])
    }

    @Test("LocalSupplementLog synthetic init defaults entryIds to empty")
    func localSupplementLogSyntheticInit() throws {
        let local = LocalSupplementLog(supplementId: "s1", date: "2026-06-01", takenAt: "2026-06-01T08:00:00Z")
        let restored = try #require(local.toSupplementLog())

        #expect(local.id == "s1-2026-06-01")
        #expect(restored.takenAt == "2026-06-01T08:00:00Z")
        #expect(restored.entryIds.isEmpty)
    }

    @Test("LocalGoals round-trips including optional goals")
    func localGoalsRoundTrip() throws {
        let goals = Goals(
            calorieGoal: 2200,
            proteinGoal: 160,
            carbGoal: 240,
            fatGoal: 70,
            fiberGoal: 35,
            sodiumGoal: 2300,
            sugarGoal: nil
        )

        let local = LocalGoals(goals: goals)
        let restored = try #require(local.toGoals())

        #expect(local.id == LocalGoals.singletonId)
        #expect(restored.calorieGoal == 2200)
        #expect(restored.proteinGoal == 160)
        #expect(restored.sodiumGoal == 2300)
        #expect(restored.sugarGoal == nil)
    }

    @Test("LocalPreferences round-trips")
    func localPreferencesRoundTrip() throws {
        let preferences = Preferences(
            showChartWidget: false,
            showFavoritesWidget: true,
            showSupplementsWidget: true,
            showWeightWidget: false,
            showMealBreakdownWidget: true,
            showTopFoodsWidget: false,
            showSleepWidget: true,
            widgetOrder: ["chart", "weight"],
            startPage: "dashboard",
            favoriteTapAction: "instant",
            favoriteMealAssignmentMode: "ask_meal",
            visibleNutrients: ["sugar", "sodium"],
            locale: "de",
            timeZone: "Europe/Zurich"
        )

        let local = LocalPreferences(preferences: preferences)
        let restored = try #require(local.toPreferences())

        #expect(local.id == LocalPreferences.singletonId)
        #expect(restored.showChartWidget == false)
        #expect(restored.widgetOrder == ["chart", "weight"])
        #expect(restored.favoriteMealAssignmentMode == "ask_meal")
        #expect(restored.visibleNutrients == ["sugar", "sodium"])
        #expect(restored.locale == "de")
    }

    @Test("LocalDayProperties round-trips")
    func localDayPropertiesRoundTrip() throws {
        let properties = DayProperties(date: "2026-06-01", isFastingDay: true)

        let local = LocalDayProperties(properties: properties)
        let restored = try #require(local.toDayProperties())

        #expect(local.date == "2026-06-01")
        #expect(local.isFastingDay == true)
        #expect(restored.date == "2026-06-01")
        #expect(restored.isFastingDay == true)
    }
}
