@testable import Bissbilanz
import Foundation
import Testing

/// Asserts the JSON fixtures in `tests/fixtures/shared/` against the Swift implementations.
/// The web (`tests/shared-fixtures`) and Android (`SharedFixturesTest`) suites assert the same
/// files, so a rule implemented on all three platforms cannot drift apart unnoticed. Each
/// fixture lists which platforms implement a function (`implementations`) and any documented
/// known divergence (`divergences`).
@Suite("Shared cross-platform fixtures")
@MainActor
struct SharedFixtureTests {
    // MARK: - Goal rules

    @Test("Goal rules match the shared fixtures", arguments: ["goal-rules", "generated-goal-rules"])
    func goalRules(file: String) throws {
        let failures = try SharedFixtures.check(file) { fixtureCase in
            let input = fixtureCase.input
            switch fixtureCase.fn {
            case "adjustGoalsForActivity":
                let goals = try SharedFixtures.decode(Goals.self, from: input["goals"] ?? [String: Any]())
                let result = adjustGoalsForActivity(
                    goals: goals,
                    activityCalories: (input["activityCalories"] as? NSNumber)?.intValue,
                    enabled: (input["enabled"] as? Bool) ?? false,
                    creditPercent: (input["creditPercent"] as? NSNumber)?.intValue ?? 0
                )
                let adjusted: [String: Any] = [
                    "calorieGoal": result.goals.calorieGoal,
                    "proteinGoal": result.goals.proteinGoal,
                    "carbGoal": result.goals.carbGoal,
                    "fatGoal": result.goals.fatGoal,
                    "fiberGoal": result.goals.fiberGoal,
                    "sodiumGoal": SharedFixtures.orNull(result.goals.sodiumGoal),
                    "sugarGoal": SharedFixtures.orNull(result.goals.sugarGoal),
                ]
                return ["activityBonus": result.activityBonus, "goals": adjusted] as [String: Any]
            default:
                throw SharedFixtureError.malformed("no Swift harness for fn \(fixtureCase.fn)")
            }
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    // MARK: - Recipe math

    @Test(
        "Recipe math matches the shared fixtures",
        arguments: ["recipe-math", "generated-recipe-math", "generated-unit-conversion"]
    )
    func recipeMath(file: String) throws {
        let failures = try SharedFixtures.check(file) { fixtureCase in
            let input = fixtureCase.input
            switch fixtureCase.fn {
            case "convertQuantityForMacros":
                let from = try #require(ServingUnit(rawValue: input["from"] as? String ?? ""))
                let to = try #require(ServingUnit(rawValue: input["to"] as? String ?? ""))
                return convertQuantityForMacros(SharedFixtures.number(input["quantity"]) ?? 0, from: from, to: to)

            case "recipeMacros":
                let totalServings = SharedFixtures.number(input["totalServings"]) ?? 1
                let ingredients = try (input["ingredients"] as? [[String: Any]] ?? []).enumerated().map { index, raw in
                    try Self.makeIngredient(index: index, raw: raw)
                }
                // The Swift aggregation is whole-recipe (per-serving division happens at entry
                // creation), so `perServing` is derived here; the Kotlin suite asserts it natively.
                let total = RecipeRepository.recipeMacros(of: ingredients)
                let totals: [String: Any] = [
                    "calories": total.calories,
                    "protein": total.protein,
                    "carbs": total.carbs,
                    "fat": total.fat,
                    "fiber": total.fiber,
                ]
                let perServing: [String: Any] = [
                    "calories": total.calories / totalServings,
                    "protein": total.protein / totalServings,
                    "carbs": total.carbs / totalServings,
                    "fat": total.fat / totalServings,
                    "fiber": total.fiber / totalServings,
                ]
                return ["total": totals, "perServing": perServing] as [String: Any]

            case "cookedWeightServingSize":
                let recipe = try Self.makeRecipe(
                    totalServings: SharedFixtures.number(input["totalServings"]) ?? 1,
                    cookedWeight: SharedFixtures.number(input["cookedWeight"])
                )
                return SharedFixtures.orNull(recipe.cookedWeightServingSize)

            case "caloriesPerHundredGrams":
                let recipe = try Self.makeRecipe(
                    totalServings: SharedFixtures.number(input["totalServings"]) ?? 1,
                    cookedWeight: SharedFixtures.number(input["cookedWeight"]),
                    macros: ["calories": SharedFixtures.number(input["calories"]) ?? 0]
                )
                return SharedFixtures.orNull(recipe.caloriesPerHundredGrams)

            case "wholeToPerServing":
                let macros = input["macros"] as? [String: Any] ?? [:]
                let recipe = try Self.makeRecipe(
                    totalServings: SharedFixtures.number(input["totalServings"]) ?? 1,
                    cookedWeight: nil,
                    macros: macros.compactMapValues { SharedFixtures.number($0) }
                )
                return [
                    "calories": SharedFixtures.orNull(recipe.caloriesPerServing),
                    "protein": SharedFixtures.orNull(recipe.proteinPerServing),
                    "carbs": SharedFixtures.orNull(recipe.carbsPerServing),
                    "fat": SharedFixtures.orNull(recipe.fatPerServing),
                    "fiber": SharedFixtures.orNull(recipe.fiberPerServing),
                ] as [String: Any]

            default:
                throw SharedFixtureError.malformed("no Swift harness for fn \(fixtureCase.fn)")
            }
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    private static func makeIngredient(index: Int, raw: [String: Any]) throws -> RecipeIngredient {
        var food: [String: Any] = raw["food"] as? [String: Any] ?? [:]
        food["id"] = "f\(index)"
        food["userId"] = "u1"
        food["name"] = "Food \(index)"
        food["isFavorite"] = false
        return try JSONPatch.decode(RecipeIngredient.self, from: [
            "foodId": "f\(index)",
            "quantity": raw["quantity"] ?? 0,
            "servingUnit": raw["servingUnit"] ?? "g",
            "sortOrder": index,
            "food": food,
        ])
    }

    private static func makeRecipe(
        totalServings: Double,
        cookedWeight: Double?,
        macros: [String: Double] = [:]
    ) throws -> Recipe {
        var dict: [String: Any] = [
            "id": "r1",
            "userId": "u1",
            "name": "Recipe",
            "totalServings": totalServings,
            "isFavorite": false,
        ]
        if let cookedWeight { dict["cookedWeight"] = cookedWeight }
        for (key, value) in macros { dict[key] = value }
        return try JSONPatch.decode(Recipe.self, from: dict)
    }

    // MARK: - Meal types

    /// `normalizeMealType` is `MealGrouping.canonicalKey` on iOS (lowercase keys for the four
    /// built-in meals, which the fixture spells the way the server does); the ordering is
    /// `WidgetSnapshotWriter.mealPrecedes`, the order the day log and the watch use.
    @Test("Meal types match the generated shared fixtures")
    func mealTypes() throws {
        let failures = try SharedFixtures.check("generated-meal-types") { fixtureCase in
            let input = fixtureCase.input
            switch fixtureCase.fn {
            case "normalizeMealType":
                let key = MealGrouping.canonicalKey(input["value"] as? String ?? "")
                guard MealGrouping.order.contains(key) else { return key }
                return key.prefix(1).uppercased() + key.dropFirst()

            case "mealForHour":
                let hour = (input["hour"] as? NSNumber)?.intValue ?? 0
                let components = DateComponents(year: 2026, month: 1, day: 15, hour: hour, minute: 30)
                let date = try #require(Calendar.current.date(from: components))
                return MealTiming.mealForCurrentTime(date)

            case "orderMealTypes":
                let present = input["present"] as? [String] ?? []
                return Array(Set(present)).sorted(by: WidgetSnapshotWriter.mealPrecedes)

            default:
                throw SharedFixtureError.malformed("no Swift harness for fn \(fixtureCase.fn)")
            }
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    // MARK: - Label parsing

    @Test("Label parsing matches the shared fixtures")
    func labelParsing() throws {
        let failures = try SharedFixtures.check("label-parsing") { fixtureCase in
            let input = fixtureCase.input
            let rows = input["rows"] as? [String] ?? []
            switch fixtureCase.fn {
            case "parseRows":
                let parsed = NutritionLabelParser.parse(rows: rows)
                return [
                    "calories": SharedFixtures.orNull(parsed.calories),
                    "protein": SharedFixtures.orNull(parsed.protein),
                    "carbs": SharedFixtures.orNull(parsed.carbs),
                    "fat": SharedFixtures.orNull(parsed.fat),
                    "fiber": SharedFixtures.orNull(parsed.fiber),
                    "sugar": SharedFixtures.orNull(parsed.sugar),
                    "saturatedFat": SharedFixtures.orNull(parsed.saturatedFat),
                    "salt": SharedFixtures.orNull(parsed.salt),
                    "sodium": SharedFixtures.orNull(parsed.sodium),
                    "isVolume": parsed.isVolume,
                ] as [String: Any]

            case "isVolumeBasis":
                return NutritionLabelParser.isVolumeBasis(rows)

            case "parseDecimal":
                return SharedFixtures.orNull(
                    NutritionLabelParser.parseDecimal(
                        input["token"] as? String ?? "",
                        energyKJ: (input["energyKJ"] as? Bool) ?? false
                    )
                )

            default:
                throw SharedFixtureError.malformed("no Swift harness for fn \(fixtureCase.fn)")
            }
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    // MARK: - Sync scenarios

    /// Every case queues a few changes, scripts the server's answers over the stubbed
    /// `URLProtocol` and checks what the real `SyncManager` drain did: the requests it sent and
    /// what became of each row (removed, parked, or still queued with its retry count).
    @Test("Sync scenarios match the shared fixtures")
    func syncScenarios() async throws {
        let fixture = try SharedFixtures.load("sync-scenarios")
        var failures: [String] = []
        for fixtureCase in fixture.cases {
            do {
                let actual = try await Self.runSyncScenario(fixtureCase.input)
                failures += SharedFixtures.diff(
                    actual, fixtureCase.expected, tolerance: fixture.tolerance, path: fixtureCase.label
                ).map { "sync-scenarios \($0)" }
            } catch {
                failures.append("sync-scenarios \(fixtureCase.label): threw \(error)")
            }
        }
        #expect(!fixture.cases.isEmpty)
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    private static func runSyncScenario(_ input: [String: Any]) async throws -> [String: Any] {
        // Offline while the queue is built, so the repositories enqueue instead of uploading.
        let harness = try RepositoryHarness(online: false)
        let server = input["server"] as? [String: [[String: Any]]] ?? [:]
        for (signature, script) in server {
            let parts = signature.split(separator: " ", maxSplits: 1).map(String.init)
            let responses = script.map { stubbedResponse($0, signature: signature) }
            guard let last = responses.last else { continue }
            harness.stub(parts[0], parts[1], status: last.status, json: last.json, headers: last.headers)
            if responses.count > 1 {
                harness.stubSequence(parts[0], parts[1], Array(responses.dropLast()))
            }
        }

        let steps = input["queue"] as? [[String: Any]] ?? []
        var foods: [String: Food] = [:]
        for step in steps {
            let ref = step["ref"] as? String ?? ""
            switch step["op"] as? String ?? "" {
            case "createFood":
                foods[ref] = try await harness.foodRepository.createFood(scenarioFoodCreate())

            case "createEntry":
                if let foodRef = step["food"] as? String, let food = foods[foodRef] {
                    let body = EntryCreate(foodId: food.id, mealType: "lunch", servings: 1, date: "2026-06-01")
                    _ = try await harness.entryRepository.createEntry(body, food: food)
                } else {
                    let body = EntryCreate(
                        foodId: step["foodId"] as? String, mealType: "lunch", servings: 1, date: "2026-06-01"
                    )
                    harness.syncManager.enqueue(.createEntry(body: body, localId: LocalStore.makeTempId()))
                }

            case "deleteEntry":
                harness.syncManager.enqueue(.deleteEntry(id: step["id"] as? String ?? ""))

            default:
                throw SharedFixtureError.malformed("unknown op in \(step)")
            }
        }
        // Rows come back in enqueue order; ref i is the i-th row.
        let rowIds = harness.syncManager.queuedRows().map(\.id)
        guard rowIds.count == steps.count else {
            throw SharedFixtureError.malformed("queued \(rowIds.count) rows for \(steps.count) steps")
        }

        harness.connectivity.isOnline = true
        let drains = (input["drains"] as? NSNumber)?.intValue ?? 1
        let reset = (input["resetBackoffBetweenDrains"] as? Bool) ?? true
        for n in 0 ..< drains {
            if n > 0, reset { harness.syncManager.resetBackoffForTesting() }
            await harness.syncManager.drainPendingQueue()
        }

        var remaining: [UUID: PendingSyncOperation] = [:]
        for row in harness.syncManager.queuedRows() { remaining[row.id] = row }
        var rows: [String: Any] = [:]
        var retryCounts: [String: Any] = [:]
        for (index, step) in steps.enumerated() {
            let ref = step["ref"] as? String ?? ""
            let row = remaining[rowIds[index]]
            if let row {
                rows[ref] = row.failedAt == nil ? "live" : "parked"
            } else {
                rows[ref] = "removed"
            }
            retryCounts[ref] = row?.retryCount ?? 0
        }

        let requests = harness.recordedRequests
        var stableKeys = true
        for signature in Set(requests) {
            let parts = signature.split(separator: " ", maxSplits: 1).map(String.init)
            let keys = harness.recordedHeaders(parts[0], parts[1]).map { $0["Idempotency-Key"] ?? "" }
            if Set(keys).count > 1 { stableKeys = false }
        }
        let entryFoodIds = try harness.recordedBodies("POST", "/api/entries").map {
            try JSONDecoder().decode(EntryCreate.self, from: $0).foodId ?? ""
        }
        return [
            "requests": requests,
            "rows": rows,
            "retryCounts": retryCounts,
            "entryFoodIds": entryFoodIds,
            "stableKeys": stableKeys,
        ]
    }

    private static func scenarioFoodCreate() -> FoodCreate {
        FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
    }

    private static func stubbedResponse(
        _ raw: [String: Any], signature: String
    ) -> (status: Int, json: String, headers: [String: String]) {
        let status = (raw["status"] as? NSNumber)?.intValue ?? 200
        let headers = raw["headers"] as? [String: String] ?? [:]
        let result = raw["result"] as? String
        if status == 204 { return (status, "", headers) }
        if result == "unreadable" {
            return (status, #"{"food": {"id": "f-server"}}"#, headers)
        }
        if let result, result.hasPrefix("created:") {
            let id = String(result.dropFirst("created:".count))
            if signature.contains("/api/entries") {
                return (status, """
                {"entry": {"id": "\(id)", "userId": "u1", "date": "2026-06-01", "mealType": "lunch", "servings": 1}}
                """, headers)
            }
            return (status, """
            {"food": {
                "id": "\(id)", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
                "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
            }}
            """, headers)
        }
        return (status, #"{"error": "x"}"#, headers)
    }

    // MARK: - Sync conflict handling

    /// Every case queues one write, answers it with one server response and checks what the
    /// real `SyncManager` drain did with it: removed, parked, retried with backoff, or left
    /// untouched (426).
    @Test("Sync conflict handling matches the shared fixtures")
    func conflictResolution() async throws {
        let fixture = try SharedFixtures.load("conflict-resolution")
        var failures: [String] = []

        for fixtureCase in fixture.cases {
            let input = fixtureCase.input
            let op = input["op"] as? String ?? ""
            let status = (input["status"] as? NSNumber)?.intValue ?? 0
            let conflictHeader = input["conflictHeader"] as? String
            let expected = fixtureCase.expected as? [String: Any] ?? [:]

            let harness = try RepositoryHarness()
            let headers = conflictHeader.map { ["X-Sync-Conflict": $0] } ?? [:]
            let body = status == 204 ? "" : #"{"error": "x"}"#

            switch op {
            case "update":
                harness.stub("PATCH", "/api/weight/w1", status: status, json: body, headers: headers)
                harness.syncManager.enqueue(.updateWeight(id: "w1", body: WeightUpdate(weightKg: 80)))
            case "delete":
                harness.stub("DELETE", "/api/entries/e1", status: status, json: body, headers: headers)
                harness.syncManager.enqueue(.deleteEntry(id: "e1"))
            case "create":
                harness.stub("POST", "/api/entries", status: status, json: body, headers: headers)
                harness.syncManager.enqueue(.createEntry(
                    body: EntryCreate(foodId: "real-food-id", mealType: "lunch", servings: 1, date: "2026-06-01"),
                    localId: LocalStore.makeTempId()
                ))
            default:
                failures.append("\(fixtureCase.label): unknown op \(op)")
                continue
            }

            await harness.syncManager.drainPendingQueue()

            let rows = harness.syncManager.queuedRows()
            let parked = rows.filter { $0.failedAt != nil }
            let live = rows.filter { $0.failedAt == nil }
            let queue: String
            if rows.isEmpty {
                queue = "removed"
            } else if parked.count == 1, live.isEmpty {
                queue = "parked"
            } else if live.count == 1, parked.isEmpty {
                queue = live[0].retryCount == 0 ? "kept" : "retry"
            } else {
                queue = "unexpected(live=\(live.count), parked=\(parked.count))"
            }
            let notice = !harness.syncManager.conflictNotices.isEmpty

            let expectedQueue = expected["queue"] as? String ?? ""
            if queue != expectedQueue {
                failures.append("\(fixtureCase.label): expected queue \(expectedQueue), got \(queue)")
            }
            if expectedQueue == "retry", live.first?.retryCount != 1 {
                failures.append("\(fixtureCase.label): expected retryCount 1, got \(String(describing: live.first?.retryCount))")
            }
            if let expectedNotice = expected["conflictNotice"] as? Bool, expectedNotice != notice {
                failures.append("\(fixtureCase.label): expected conflictNotice \(expectedNotice), got \(notice)")
            }
        }
        #expect(!fixture.cases.isEmpty)
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }
}
