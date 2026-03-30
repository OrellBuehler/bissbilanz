import Foundation
import Testing

@testable import Bissbilanz

@Suite("APIError Tests")
struct APIErrorTests {
    @Test("Unauthorized error description")
    func unauthorizedDescription() {
        let error = APIError.unauthorized
        #expect(error.errorDescription == "Not authenticated")
    }

    @Test("Not found error description")
    func notFoundDescription() {
        let error = APIError.notFound
        #expect(error.errorDescription == "Not found")
    }

    @Test("Bad request with message")
    func badRequestWithMessage() {
        let error = APIError.badRequest("Invalid field")
        #expect(error.errorDescription == "Invalid field")
    }

    @Test("Bad request without message uses default")
    func badRequestNoMessage() {
        let error = APIError.badRequest(nil)
        #expect(error.errorDescription == "Bad request")
    }

    @Test("Server error with code and message")
    func serverErrorWithMessage() {
        let error = APIError.serverError(503, "Service unavailable")
        #expect(error.errorDescription == "Service unavailable")
    }

    @Test("Server error without message uses code")
    func serverErrorNoMessage() {
        let error = APIError.serverError(500, nil)
        #expect(error.errorDescription == "Server error (500)")
    }

    @Test("Network error wraps underlying error")
    func networkErrorDescription() {
        let urlError = URLError(.notConnectedToInternet)
        let error = APIError.networkError(urlError)
        #expect(error.errorDescription != nil)
    }

    @Test("Decoding error wraps underlying error")
    func decodingErrorDescription() throws {
        let json = "{}".data(using: .utf8)!
        let decodingError: any Error
        do {
            _ = try JSONDecoder().decode(FoodResponse.self, from: json)
            Issue.record("Expected decoding to fail")
            return
        } catch {
            decodingError = error
        }
        let apiError = APIError.decodingError(decodingError)
        #expect(apiError.errorDescription?.starts(with: "Failed to parse response") == true)
    }
}

@Suite("API Request Building Tests")
struct APIRequestBuildingTests {
    @Test("GET request with query params builds correct URL")
    func getWithQueryParams() {
        var components = URLComponents(string: "https://example.com/api/foods")!
        components.queryItems = ["search": "apple", "limit": "10"].map {
            URLQueryItem(name: $0.key, value: $0.value)
        }
        let url = components.url!

        #expect(url.absoluteString.contains("search=apple"))
        #expect(url.absoluteString.contains("limit=10"))
    }

    @Test("POST request body encoding")
    func postBodyEncoding() throws {
        let entry = EntryCreate(
            foodId: "food-1",
            mealType: "lunch",
            servings: 1.5,
            date: "2026-03-12",
            eatenAt: "12:30"
        )

        let data = try JSONEncoder().encode(entry)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["foodId"] as? String == "food-1")
        #expect(json["mealType"] as? String == "lunch")
        #expect(json["servings"] as? Double == 1.5)
        #expect(json["date"] as? String == "2026-03-12")
        #expect(json["eatenAt"] as? String == "12:30")
        #expect(json["recipeId"] == nil)
        #expect(json["quickName"] == nil)
    }

    @Test("Recipe create body encoding")
    func recipeCreateEncoding() throws {
        let recipe = RecipeCreate(
            name: "Oatmeal Bowl",
            totalServings: 2,
            ingredients: [
                RecipeIngredientInput(foodId: "f1", quantity: 80, servingUnit: .g),
                RecipeIngredientInput(foodId: "f2", quantity: 200, servingUnit: .ml),
            ],
            isFavorite: true
        )

        let data = try JSONEncoder().encode(recipe)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["name"] as? String == "Oatmeal Bowl")
        #expect(json["totalServings"] as? Double == 2)
        #expect(json["isFavorite"] as? Bool == true)

        let ingredients = json["ingredients"] as! [[String: Any]]
        #expect(ingredients.count == 2)
        #expect(ingredients[0]["foodId"] as? String == "f1")
        #expect(ingredients[0]["quantity"] as? Double == 80)
        #expect(ingredients[0]["servingUnit"] as? String == "g")
    }

    @Test("Supplement create body encoding with schedule")
    func supplementCreateEncoding() throws {
        let supplement = SupplementCreate(
            name: "Vitamin D",
            dosage: 4000,
            dosageUnit: "IU",
            scheduleType: .daily,
            timeOfDay: "morning"
        )

        let data = try JSONEncoder().encode(supplement)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["name"] as? String == "Vitamin D")
        #expect(json["dosage"] as? Double == 4000)
        #expect(json["dosageUnit"] as? String == "IU")
        #expect(json["scheduleType"] as? String == "daily")
        #expect(json["timeOfDay"] as? String == "morning")
    }

    @Test("Supplement create with specific days schedule")
    func supplementSpecificDaysEncoding() throws {
        let supplement = SupplementCreate(
            name: "Iron",
            dosage: 25,
            dosageUnit: "mg",
            scheduleType: .specificDays,
            scheduleDays: [1, 3, 5]
        )

        let data = try JSONEncoder().encode(supplement)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["scheduleType"] as? String == "specific_days")
        #expect(json["scheduleDays"] as? [Int] == [1, 3, 5])
    }

    @Test("Weight update partial encoding")
    func weightUpdatePartialEncoding() throws {
        let update = WeightUpdate(weightKg: 74.2)

        let data = try JSONEncoder().encode(update)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["weightKg"] as? Double == 74.2)
        #expect(json["entryDate"] == nil)
        #expect(json["notes"] == nil)
    }

    @Test("Entry update partial encoding")
    func entryUpdatePartialEncoding() throws {
        let update = EntryUpdate(mealType: "dinner", servings: 2.0)

        let data = try JSONEncoder().encode(update)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["mealType"] as? String == "dinner")
        #expect(json["servings"] as? Double == 2.0)
        #expect(json["date"] == nil)
        #expect(json["notes"] == nil)
    }

    @Test("Preferences update partial encoding")
    func preferencesUpdateEncoding() throws {
        let update = PreferencesUpdate(
            showWeightWidget: false,
            visibleNutrients: ["sugar", "sodium", "vitaminC"]
        )

        let data = try JSONEncoder().encode(update)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["showWeightWidget"] as? Bool == false)
        #expect(json["visibleNutrients"] as? [String] == ["sugar", "sodium", "vitaminC"])
        #expect(json["showChartWidget"] == nil)
    }

    @Test("Maintenance request encoding")
    func maintenanceRequestEncoding() throws {
        let request = MaintenanceRequest(
            startDate: "2026-01-01",
            endDate: "2026-03-01",
            bodyFatChangeRatio: 0.7
        )

        let data = try JSONEncoder().encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json["startDate"] as? String == "2026-01-01")
        #expect(json["endDate"] as? String == "2026-03-01")
        #expect(json["bodyFatChangeRatio"] as? Double == 0.7)
    }

    @Test("DayProperties set uses snake_case keys")
    func dayPropertiesSetEncoding() throws {
        let props = DayPropertiesSet(isFastingDay: true)

        let data = try JSONEncoder().encode(props)
        let jsonStr = String(data: data, encoding: .utf8)!

        #expect(jsonStr.contains("is_fasting_day"))
        #expect(!jsonStr.contains("isFastingDay"))
    }
}

@Suite("API Response Decoding Tests")
struct APIResponseDecodingTests {
    @Test("Food response decodes from JSON")
    func foodResponseDecoding() throws {
        let json = """
        {
            "food": {
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
                "additives": [],
                "createdAt": "2026-01-15T10:00:00Z",
                "updatedAt": "2026-01-15T10:00:00Z"
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(FoodResponse.self, from: json)
        #expect(response.food.id == "f1")
        #expect(response.food.name == "Apple")
        #expect(response.food.brand == "Organic")
        #expect(response.food.servingSize == 182)
        #expect(response.food.servingUnit == .g)
        #expect(response.food.calories == 95)
        #expect(response.food.sugar == 18.9)
        #expect(response.food.vitaminC == 8.4)
        #expect(response.food.barcode == "012345678901")
        #expect(response.food.isFavorite == true)
        #expect(response.food.nutriScore == "a")
        #expect(response.food.novaGroup == 1)
    }

    @Test("Foods response decodes array")
    func foodsResponseDecoding() throws {
        let json = """
        {
            "foods": [
                {
                    "id": "f1", "userId": "u1", "name": "Apple", "servingSize": 100, "servingUnit": "g",
                    "calories": 52, "protein": 0.3, "carbs": 13.8, "fat": 0.2, "fiber": 2.4,
                    "isFavorite": false
                },
                {
                    "id": "f2", "userId": "u1", "name": "Banana", "servingSize": 118, "servingUnit": "g",
                    "calories": 89, "protein": 1.1, "carbs": 22.8, "fat": 0.3, "fiber": 2.6,
                    "isFavorite": true
                }
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(FoodsResponse.self, from: json)
        #expect(response.foods.count == 2)
        #expect(response.foods[0].name == "Apple")
        #expect(response.foods[1].name == "Banana")
        #expect(response.foods[1].isFavorite == true)
    }

    @Test("Entry response with nested food decodes")
    func entryWithFoodDecoding() throws {
        let json = """
        {
            "entry": {
                "id": "e1",
                "userId": "u1",
                "foodId": "f1",
                "date": "2026-03-12",
                "mealType": "breakfast",
                "servings": 1.5,
                "food": {
                    "id": "f1", "userId": "u1", "name": "Oats", "servingSize": 40, "servingUnit": "g",
                    "calories": 150, "protein": 5, "carbs": 27, "fat": 2.5, "fiber": 4,
                    "isFavorite": false
                }
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(EntryResponse.self, from: json)
        #expect(response.entry.id == "e1")
        #expect(response.entry.servings == 1.5)
        #expect(response.entry.food?.name == "Oats")
        #expect(response.entry.totalCalories == 225) // 150 * 1.5
    }

    @Test("Entry response with recipe decodes")
    func entryWithRecipeDecoding() throws {
        let json = """
        {
            "entry": {
                "id": "e2",
                "userId": "u1",
                "recipeId": "r1",
                "date": "2026-03-12",
                "mealType": "lunch",
                "servings": 1,
                "recipe": {
                    "id": "r1", "userId": "u1", "name": "Pasta", "totalServings": 4,
                    "isFavorite": true, "calories": 450, "protein": 15, "carbs": 60,
                    "fat": 12, "fiber": 3
                }
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(EntryResponse.self, from: json)
        #expect(response.entry.recipeId == "r1")
        #expect(response.entry.recipe?.name == "Pasta")
        #expect(response.entry.displayName == "Pasta")
        #expect(response.entry.totalCalories == 450)
    }

    @Test("Quick entry response decodes")
    func quickEntryDecoding() throws {
        let json = """
        {
            "entry": {
                "id": "e3",
                "userId": "u1",
                "date": "2026-03-12",
                "mealType": "snacks",
                "servings": 1,
                "quickName": "Energy Bar",
                "quickCalories": 250,
                "quickProtein": 10,
                "quickCarbs": 35,
                "quickFat": 8,
                "quickFiber": 2
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(EntryResponse.self, from: json)
        #expect(response.entry.quickName == "Energy Bar")
        #expect(response.entry.displayName == "Energy Bar")
        #expect(response.entry.totalCalories == 250)
        #expect(response.entry.food == nil)
        #expect(response.entry.recipe == nil)
    }

    @Test("Goals response with null goals decodes")
    func nullGoalsDecoding() throws {
        let json = """
        {"goals": null}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(GoalsResponse.self, from: json)
        #expect(response.goals == nil)
    }

    @Test("Weight stats response decodes snake_case keys")
    func weightStatsDecoding() throws {
        let json = """
        {
            "latest": 75.5,
            "trend": 75.2,
            "delta_7d": -0.3,
            "projected_14d": 74.9,
            "projected_30d": 74.3,
            "projected_60d": 73.1,
            "entry_count": 28
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(WeightStatsResponse.self, from: json)
        #expect(response.latest == 75.5)
        #expect(response.trend == 75.2)
        #expect(response.delta7d == -0.3)
        #expect(response.projected14d == 74.9)
        #expect(response.projected30d == 74.3)
        #expect(response.projected60d == 73.1)
        #expect(response.entryCount == 28)
    }

    @Test("Weight stats with null optionals decodes")
    func weightStatsNullsDecoding() throws {
        let json = """
        {
            "entry_count": 0
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(WeightStatsResponse.self, from: json)
        #expect(response.latest == nil)
        #expect(response.trend == nil)
        #expect(response.delta7d == nil)
        #expect(response.entryCount == 0)
    }

    @Test("Streaks response decodes")
    func streaksDecoding() throws {
        let json = """
        {"currentStreak": 14, "longestStreak": 45}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(StreaksResponse.self, from: json)
        #expect(response.currentStreak == 14)
        #expect(response.longestStreak == 45)
    }

    @Test("Supplement checklist response decodes")
    func supplementChecklistDecoding() throws {
        let json = """
        {
            "checklist": [
                {
                    "supplement": {
                        "id": "s1", "userId": "u1", "name": "Vitamin D",
                        "dosage": 4000, "dosageUnit": "IU",
                        "scheduleType": "daily", "isActive": true, "sortOrder": 0
                    },
                    "taken": true,
                    "log": {
                        "id": "l1", "supplementId": "s1", "userId": "u1",
                        "date": "2026-03-12", "takenAt": "2026-03-12T08:00:00Z"
                    }
                },
                {
                    "supplement": {
                        "id": "s2", "userId": "u1", "name": "Omega-3",
                        "dosage": 1000, "dosageUnit": "mg",
                        "scheduleType": "daily", "isActive": true, "sortOrder": 1
                    },
                    "taken": false
                }
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(SupplementChecklistResponse.self, from: json)
        #expect(response.checklist.count == 2)
        #expect(response.checklist[0].supplement.name == "Vitamin D")
        #expect(response.checklist[0].taken == true)
        #expect(response.checklist[0].log?.id == "l1")
        #expect(response.checklist[1].taken == false)
        #expect(response.checklist[1].log == nil)
    }

    @Test("DayProperties response decodes snake_case keys")
    func dayPropertiesDecoding() throws {
        let json = """
        {
            "properties": {
                "date": "2026-03-12",
                "user_id": "u1",
                "is_fasting_day": true
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(DayPropertiesResponse.self, from: json)
        #expect(response.properties?.isFastingDay == true)
        #expect(response.properties?.date == "2026-03-12")
    }

    @Test("DayProperties response with null properties")
    func dayPropertiesNullDecoding() throws {
        let json = """
        {"properties": null}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(DayPropertiesResponse.self, from: json)
        #expect(response.properties == nil)
    }

    @Test("Maintenance response decodes")
    func maintenanceResponseDecoding() throws {
        let json = """
        {
            "maintenanceCalories": 2350,
            "avgDailyCalories": 2100,
            "dailyDeficitSurplus": -250,
            "weightChange": -2.1,
            "startWeight": 78.5,
            "endWeight": 76.4,
            "totalDays": 60,
            "weightEntryCount": 45,
            "foodEntryDays": 55,
            "coveragePercent": 91.7,
            "fatChange": -1.5,
            "muscleChange": -0.6
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(MaintenanceResponse.self, from: json)
        #expect(response.maintenanceCalories == 2350)
        #expect(response.avgDailyCalories == 2100)
        #expect(response.dailyDeficitSurplus == -250)
        #expect(response.weightChange == -2.1)
        #expect(response.coveragePercent == 91.7)
        #expect(response.fatChange == -1.5)
        #expect(response.muscleChange == -0.6)
    }

    @Test("Favorites response with recipes decodes")
    func favoritesResponseDecoding() throws {
        let json = """
        {
            "foods": [
                {
                    "id": "f1", "userId": "u1", "name": "Greek Yogurt", "servingSize": 170, "servingUnit": "g",
                    "calories": 100, "protein": 17, "carbs": 6, "fat": 0.7, "fiber": 0,
                    "isFavorite": true
                }
            ],
            "recipes": [
                {
                    "id": "r1", "userId": "u1", "name": "Smoothie", "totalServings": 1,
                    "isFavorite": true, "calories": 280, "protein": 15, "carbs": 45, "fat": 5, "fiber": 6
                }
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(FavoritesResponse.self, from: json)
        #expect(response.foods.count == 1)
        #expect(response.foods[0].name == "Greek Yogurt")
        #expect(response.recipes?.count == 1)
        #expect(response.recipes?[0].name == "Smoothie")
    }

    @Test("Top foods response decodes")
    func topFoodsDecoding() throws {
        let json = """
        {
            "data": [
                {
                    "foodId": "f1", "foodName": "Rice",
                    "count": 12, "calories": 1560, "protein": 32.4,
                    "carbs": 336, "fat": 3.6, "fiber": 4.8
                },
                {
                    "recipeId": "r1", "foodName": "Chicken Stir Fry",
                    "count": 8, "calories": 3600, "protein": 240,
                    "carbs": 160, "fat": 96, "fiber": 24
                }
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(TopFoodsResponse.self, from: json)
        #expect(response.data.count == 2)
        #expect(response.data[0].id == "f1")
        #expect(response.data[1].id == "r1")
        #expect(response.data[0].count == 12)
    }

    @Test("Calendar response decodes")
    func calendarDecoding() throws {
        let json = """
        {
            "data": [
                {"date": "2026-03-01", "calories": 2100, "hasGoal": true, "metGoal": true},
                {"date": "2026-03-02", "calories": 1800, "hasGoal": true, "metGoal": false},
                {"date": "2026-03-03", "calories": 0, "hasGoal": true, "metGoal": false}
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(CalendarResponse.self, from: json)
        #expect(response.data.count == 3)
        #expect(response.data[0].metGoal == true)
        #expect(response.data[1].metGoal == false)
        #expect(response.data[2].calories == 0)
    }

    @Test("Meal breakdown response decodes")
    func mealBreakdownDecoding() throws {
        let json = """
        {
            "data": [
                {"mealType": "breakfast", "calories": 450, "protein": 25, "carbs": 55, "fat": 15, "fiber": 8},
                {"mealType": "lunch", "calories": 650, "protein": 35, "carbs": 70, "fat": 22, "fiber": 10}
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(MealBreakdownResponse.self, from: json)
        #expect(response.data.count == 2)
        #expect(response.data[0].mealType == "breakfast")
        #expect(response.data[0].calories == 450)
    }

    @Test("Supplement with ingredients decodes")
    func supplementWithIngredientsDecoding() throws {
        let json = """
        {
            "supplement": {
                "id": "s1", "userId": "u1", "name": "Multivitamin",
                "dosage": 1, "dosageUnit": "tablet",
                "scheduleType": "daily", "isActive": true, "sortOrder": 0,
                "timeOfDay": "morning",
                "ingredients": [
                    {"id": "i1", "supplementId": "s1", "name": "Vitamin A", "dosage": 900, "dosageUnit": "µg", "sortOrder": 0},
                    {"id": "i2", "supplementId": "s1", "name": "Vitamin C", "dosage": 90, "dosageUnit": "mg", "sortOrder": 1}
                ]
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(SupplementResponse.self, from: json)
        #expect(response.supplement.name == "Multivitamin")
        #expect(response.supplement.timeOfDay == "morning")
        #expect(response.supplement.ingredients?.count == 2)
        #expect(response.supplement.ingredients?[0].name == "Vitamin A")
        #expect(response.supplement.ingredients?[1].dosage == 90)
    }

    @Test("Supplement history response decodes")
    func supplementHistoryDecoding() throws {
        let json = """
        {
            "history": [
                {
                    "date": "2026-03-12",
                    "supplements": [
                        {
                            "supplement": {
                                "id": "s1", "userId": "u1", "name": "Vitamin D",
                                "dosage": 4000, "dosageUnit": "IU",
                                "scheduleType": "daily", "isActive": true, "sortOrder": 0
                            },
                            "taken": true,
                            "log": {
                                "id": "l1", "supplementId": "s1", "userId": "u1",
                                "date": "2026-03-12", "takenAt": "2026-03-12T08:00:00Z"
                            }
                        }
                    ]
                }
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(SupplementHistoryResponse.self, from: json)
        #expect(response.history.count == 1)
        #expect(response.history[0].date == "2026-03-12")
        #expect(response.history[0].supplements[0].taken == true)
    }

    @Test("Recipe with ingredients decodes")
    func recipeWithIngredientsDecoding() throws {
        let json = """
        {
            "recipe": {
                "id": "r1", "userId": "u1", "name": "Oatmeal Bowl",
                "totalServings": 2, "isFavorite": false,
                "calories": 350, "protein": 12, "carbs": 55, "fat": 8, "fiber": 7,
                "ingredients": [
                    {
                        "id": "ri1", "recipeId": "r1", "foodId": "f1",
                        "quantity": 80, "servingUnit": "g", "sortOrder": 0,
                        "food": {
                            "id": "f1", "userId": "u1", "name": "Rolled Oats",
                            "servingSize": 40, "servingUnit": "g",
                            "calories": 150, "protein": 5, "carbs": 27, "fat": 2.5, "fiber": 4,
                            "isFavorite": false
                        }
                    }
                ]
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(RecipeResponse.self, from: json)
        #expect(response.recipe.name == "Oatmeal Bowl")
        #expect(response.recipe.totalServings == 2)
        #expect(response.recipe.ingredients?.count == 1)
        #expect(response.recipe.ingredients?[0].food?.name == "Rolled Oats")
    }

    @Test("Preferences round-trip encoding")
    func preferencesRoundTrip() throws {
        let prefs = Preferences(
            showChartWidget: true,
            showFavoritesWidget: false,
            showSupplementsWidget: true,
            showWeightWidget: true,
            showMealBreakdownWidget: false,
            showTopFoodsWidget: true,
            showSummaryWidget: true,
            showDayLogWidget: false,
            showStreakWidget: true,
            widgetOrder: ["chart", "weight", "supplements"],
            startPage: "dashboard",
            favoriteTapAction: "instant",
            favoriteMealAssignmentMode: "time_based",
            visibleNutrients: ["sugar", "sodium"],
            locale: "de"
        )

        let data = try JSONEncoder().encode(prefs)
        let decoded = try JSONDecoder().decode(Preferences.self, from: data)

        #expect(decoded.showFavoritesWidget == false)
        #expect(decoded.showDayLogWidget == false)
        #expect(decoded.widgetOrder == ["chart", "weight", "supplements"])
        #expect(decoded.visibleNutrients == ["sugar", "sodium"])
        #expect(decoded.locale == "de")
    }

    @Test("Daily stats response decodes")
    func dailyStatsDecoding() throws {
        let json = """
        {
            "data": [
                {"date": "2026-03-10", "calories": 2100, "protein": 150, "carbs": 250, "fat": 65, "fiber": 30},
                {"date": "2026-03-11", "calories": 1800, "protein": 130, "carbs": 210, "fat": 55, "fiber": 25}
            ],
            "goals": {
                "calorieGoal": 2000, "proteinGoal": 150, "carbGoal": 250, "fatGoal": 65, "fiberGoal": 30
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(DailyStatsResponse.self, from: json)
        #expect(response.data.count == 2)
        #expect(response.goals?.calorieGoal == 2000)
    }

    @Test("Food with all extended nutrients decodes")
    func foodExtendedNutrientsDecoding() throws {
        let json = """
        {
            "food": {
                "id": "f1", "userId": "u1", "name": "Complete Food",
                "servingSize": 100, "servingUnit": "g",
                "calories": 200, "protein": 10, "carbs": 25, "fat": 8, "fiber": 3,
                "saturatedFat": 2.5, "monounsaturatedFat": 3.0, "polyunsaturatedFat": 1.5,
                "transFat": 0.1, "cholesterol": 30, "omega3": 0.5, "omega6": 1.0,
                "sugar": 5, "addedSugars": 2, "sugarAlcohols": 0, "starch": 15,
                "sodium": 200, "potassium": 350, "calcium": 100, "iron": 2,
                "magnesium": 30, "phosphorus": 150, "zinc": 1.5, "copper": 0.1,
                "manganese": 0.3, "selenium": 15, "iodine": 50, "fluoride": 0.5,
                "chromium": 10, "molybdenum": 20, "chloride": 100,
                "vitaminA": 300, "vitaminC": 15, "vitaminD": 5, "vitaminE": 2,
                "vitaminK": 20, "vitaminB1": 0.3, "vitaminB2": 0.4, "vitaminB3": 4,
                "vitaminB5": 1, "vitaminB6": 0.3, "vitaminB7": 10, "vitaminB9": 50,
                "vitaminB12": 1.5, "caffeine": 0, "alcohol": 0, "water": 60, "salt": 0.5,
                "isFavorite": false
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(FoodResponse.self, from: json)
        let food = response.food

        #expect(food.fatBreakdownNutrients.count == 7)
        #expect(food.sugarCarbNutrients.count == 4)
        #expect(food.mineralNutrients.count == 15)
        #expect(food.vitaminNutrients.count == 13)
        #expect(food.otherNutrients.count == 4)
    }
}
