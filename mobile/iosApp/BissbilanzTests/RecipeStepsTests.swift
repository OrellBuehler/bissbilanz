@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// Recipe cooking steps: wire encoding, the local cache and Local mode, offline
/// replay, duplication and the sign-in migration. The server side is #767's
/// `steps` field on the recipe endpoints.
@Suite("Recipe steps")
@MainActor
struct RecipeStepsTests {
    private static let oneIngredient = [RecipeIngredientInput(foodId: "f1", quantity: 100, servingUnit: .g)]

    private func recipe(
        id: String,
        name: String = "Bowl",
        steps: [(text: String, imageUrl: String?)]? = nil,
        stepCount: Int? = nil
    ) throws -> Recipe {
        var dict: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": name,
            "totalServings": 2,
            "isFavorite": false,
        ]
        if let steps {
            dict["steps"] = steps.enumerated().map { index, step -> [String: Any] in
                var item: [String: Any] = ["id": "s\(index)", "sortOrder": index, "text": step.text]
                item["imageUrl"] = step.imageUrl.map { $0 as Any } ?? NSNull()
                return item
            }
        }
        if let stepCount { dict["stepCount"] = stepCount }
        return try JSONPatch.decode(Recipe.self, from: dict)
    }

    // MARK: - Wire encoding

    @Test("RecipeCreate encodes steps in order and leaves out a missing photo")
    func createEncodesSteps() throws {
        let create = RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: Self.oneIngredient,
            steps: [
                RecipeStepInput(text: "Boil the rice", imageUrl: "/uploads/a1b2.webp"),
                RecipeStepInput(text: "Serve", imageUrl: nil),
            ]
        )

        let dict = try JSONPatch.dictionary(of: create)
        let steps = try #require(dict["steps"] as? [[String: Any]])

        #expect(steps.count == 2)
        #expect(steps[0]["text"] as? String == "Boil the rice")
        #expect(steps[0]["imageUrl"] as? String == "/uploads/a1b2.webp")
        #expect(steps[1]["text"] as? String == "Serve")
        #expect(steps[1].keys.contains("imageUrl") == false)
    }

    @Test("RecipeCreate without steps has no steps key, and an old queued body still decodes")
    func createWithoutStepsOmitsKey() throws {
        let create = RecipeCreate(name: "Bowl", totalServings: 2, ingredients: Self.oneIngredient)
        let dict = try JSONPatch.dictionary(of: create)
        #expect(dict.keys.contains("steps") == false)

        // A create queued by a build that predates steps.
        let old = Data(#"{"name":"Bowl","totalServings":2,"ingredients":[]}"#.utf8)
        let decoded = try JSONDecoder().decode(RecipeCreate.self, from: old)
        #expect(decoded.steps == nil)
    }

    @Test("RecipeUpdate only encodes steps when set, and an empty list is sent to clear them")
    func updateEncodesStepsOnlyWhenSet() throws {
        let untouched = try JSONPatch.dictionary(of: RecipeUpdate(name: "Renamed"))
        #expect(untouched.keys.contains("steps") == false)

        let replaced = try JSONPatch.dictionary(of: RecipeUpdate(steps: [RecipeStepInput(text: "Stir")]))
        let steps = try #require(replaced["steps"] as? [[String: Any]])
        #expect(steps.map { $0["text"] as? String } == ["Stir"])

        let cleared = try JSONPatch.dictionary(of: RecipeUpdate(steps: []))
        let none = try #require(cleared["steps"] as? [Any])
        #expect(none.isEmpty)
    }

    @Test("RecipeUpdate round-trips steps through its custom coding")
    func updateRoundTripsSteps() throws {
        let update = RecipeUpdate(
            name: "Renamed",
            steps: [RecipeStepInput(text: "Stir", imageUrl: "/uploads/c3d4.webp")]
        )
        let data = try JSONEncoder().encode(update)
        let decoded = try JSONDecoder().decode(RecipeUpdate.self, from: data)
        #expect(decoded.name == "Renamed")
        #expect(decoded.steps == [RecipeStepInput(text: "Stir", imageUrl: "/uploads/c3d4.webp")])
    }

    @Test("A recipe decodes with steps, with only a step count, and with neither")
    func recipeDecodesStepShapes() throws {
        let detail = try recipe(id: "r1", steps: [(text: "Second", imageUrl: nil), (text: "First", imageUrl: nil)])
        #expect(detail.hasLoadedSteps)
        #expect(detail.orderedSteps.count == 2)

        let summary = try recipe(id: "r2", stepCount: 3)
        #expect(summary.hasLoadedSteps == false)
        #expect(summary.stepCount == 3)
        #expect(summary.orderedSteps.isEmpty)

        let legacy = try recipe(id: "r3")
        #expect(legacy.steps == nil)
        #expect(legacy.stepCount == nil)
    }

    @Test("orderedSteps sorts by sortOrder")
    func orderedStepsSortsBySortOrder() throws {
        let json: [String: Any] = [
            "id": "r1", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false,
            "steps": [
                ["id": "b", "sortOrder": 1, "text": "Second", "imageUrl": NSNull()],
                ["id": "a", "sortOrder": 0, "text": "First", "imageUrl": NSNull()],
            ],
        ]
        let decoded = try JSONPatch.decode(Recipe.self, from: json)
        #expect(decoded.orderedSteps.map(\.text) == ["First", "Second"])
    }

    @Test("sanitized trims, drops blank steps and applies the server caps")
    func sanitizedAppliesServerRules() {
        let long = String(repeating: "x", count: RecipeStepLimits.maxTextLength + 40)
        let cleaned = RecipeStepInput.sanitized([
            RecipeStepInput(text: "  Boil  \n", imageUrl: "/uploads/a.webp"),
            RecipeStepInput(text: "   ", imageUrl: "/uploads/b.webp"),
            RecipeStepInput(text: long),
        ])
        #expect(cleaned.map(\.text).first == "Boil")
        #expect(cleaned.count == 2)
        #expect(cleaned[1].text.count == RecipeStepLimits.maxTextLength)

        let many = (0 ..< RecipeStepLimits.maxSteps + 5).map { RecipeStepInput(text: "Step \($0)") }
        #expect(RecipeStepInput.sanitized(many).count == RecipeStepLimits.maxSteps)
    }

    @Test("The editor's rows become trimmed inputs and keep their photos")
    func editorRowsBecomeInputs() {
        let inputs = RecipeEditSheet.stepInputs(from: [
            RecipeEditSheet.StepRow(text: " Chop ", imageUrl: "/uploads/a.webp"),
            RecipeEditSheet.StepRow(text: "", imageUrl: nil),
            RecipeEditSheet.StepRow(text: "Fry", imageUrl: nil),
        ])
        #expect(inputs == [
            RecipeStepInput(text: "Chop", imageUrl: "/uploads/a.webp"),
            RecipeStepInput(text: "Fry", imageUrl: nil),
        ])
    }

    // MARK: - Upload

    @Test("A step photo upload sends the recipe_step purpose; other uploads send none")
    func uploadSendsPurposeField() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/images/upload", json: #"{"imageUrl": "/uploads/a1b2.webp"}"#)

        let url = try await harness.api.uploadImage(Data("jpeg".utf8), purpose: "recipe_step")
        #expect(url == "/uploads/a1b2.webp")
        _ = try await harness.api.uploadImage(Data("jpeg".utf8))

        let bodies = harness.recordedBodies("POST", "/api/images/upload")
        #expect(bodies.count == 2)
        let first = String(decoding: bodies[0], as: UTF8.self)
        #expect(first.contains("name=\"purpose\""))
        #expect(first.contains("recipe_step"))
        #expect(first.contains("name=\"image\""))
        let second = String(decoding: bodies[1], as: UTF8.self)
        #expect(second.contains("name=\"purpose\"") == false)
    }

    // MARK: - Local cache

    @Test("A Local-mode row keeps its steps, photos included, through the JSON payload")
    func localRowRoundTripsSteps() throws {
        let source = try recipe(
            id: "r1",
            steps: [(text: "Chop", imageUrl: "file:///tmp/local-1.jpg"), (text: "Fry", imageUrl: nil)]
        )
        let restored = try #require(LocalRecipe(recipe: source).toRecipe())

        #expect(restored.orderedSteps.map(\.text) == ["Chop", "Fry"])
        #expect(restored.orderedSteps.first?.imageUrl == "file:///tmp/local-1.jpg")
    }

    @Test("Creating a recipe with steps caches them in order, and the drained create sends them")
    func createCachesAndSendsSteps() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {
            "id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false,
            "steps": [
                {"id": "st1", "sortOrder": 0, "text": "Chop", "imageUrl": "/uploads/a1b2.webp"},
                {"id": "st2", "sortOrder": 1, "text": "Fry", "imageUrl": null}
            ]
        }}
        """)

        let temp = try await repo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: Self.oneIngredient,
            steps: [RecipeStepInput(text: "Chop", imageUrl: "/uploads/a1b2.webp"), RecipeStepInput(text: "Fry")]
        ))

        #expect(temp.steps?.map(\.text) == ["Chop", "Fry"])
        #expect(temp.steps?.map(\.sortOrder) == [0, 1])
        #expect(temp.stepCount == 2)
        #expect(repo.recipe(id: temp.id)?.steps?.count == 2)

        await harness.syncManager.drainPendingQueue()

        let body = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let sent = try JSONDecoder().decode(RecipeCreate.self, from: body)
        #expect(sent.steps == [RecipeStepInput(text: "Chop", imageUrl: "/uploads/a1b2.webp"), RecipeStepInput(text: "Fry")])
        // The server copy replaces the optimistic one, with real step ids.
        #expect(repo.recipe(id: "r-server")?.steps?.map(\.id) == ["st1", "st2"])
    }

    @Test("A recipe created without steps reads as having none, not as unknown")
    func createWithoutStepsIsKnownEmpty() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let recipe = try await harness.recipeRepository.createRecipe(RecipeCreate(
            name: "Bowl", totalServings: 2, ingredients: Self.oneIngredient
        ))
        #expect(recipe.steps == [])
        #expect(recipe.hasLoadedSteps)
    }

    @Test("Updating without steps keeps them, including through an ingredient edit")
    func updateWithoutStepsKeepsThem() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = harness.recipeRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Rice")))
        try harness.context.save()
        let created = try await repo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: Self.oneIngredient,
            steps: [RecipeStepInput(text: "Chop"), RecipeStepInput(text: "Fry")]
        ))

        _ = try await repo.updateRecipe(id: created.id, RecipeUpdate(name: "Renamed"))
        #expect(repo.recipe(id: created.id)?.name == "Renamed")
        #expect(repo.recipe(id: created.id)?.steps?.map(\.text) == ["Chop", "Fry"])

        _ = try await repo.updateRecipe(id: created.id, RecipeUpdate(
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 300, servingUnit: .g)]
        ))
        #expect(repo.recipe(id: created.id)?.steps?.map(\.text) == ["Chop", "Fry"])
        #expect(repo.recipe(id: created.id)?.stepCount == 2)
    }

    @Test("Updating with steps replaces them, and an empty list clears them")
    func updateReplacesAndClearsSteps() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = harness.recipeRepository
        let created = try await repo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: Self.oneIngredient,
            steps: [RecipeStepInput(text: "Chop")]
        ))

        let replaced = try await repo.updateRecipe(id: created.id, RecipeUpdate(
            steps: [RecipeStepInput(text: "Fry"), RecipeStepInput(text: "Serve", imageUrl: "/uploads/a1b2.webp")]
        ))
        #expect(replaced.steps?.map(\.text) == ["Fry", "Serve"])
        #expect(replaced.stepCount == 2)
        #expect(repo.recipe(id: created.id)?.steps?.last?.imageUrl == "/uploads/a1b2.webp")

        _ = try await repo.updateRecipe(id: created.id, RecipeUpdate(steps: []))
        #expect(repo.recipe(id: created.id)?.steps == [])
        #expect(repo.recipe(id: created.id)?.stepCount == 0)
    }

    @Test("A synced update sends steps only when they were set")
    func syncedUpdateSendsStepsOnlyWhenSet() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("PATCH", "/api/recipes/r1", json: """
        {"recipe": {"id": "r1", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        try harness.context.insert(LocalRecipe(recipe: recipe(id: "r1", steps: [(text: "Chop", imageUrl: nil)])))
        try harness.context.save()

        _ = try await repo.updateRecipe(id: "r1", RecipeUpdate(name: "Renamed"))
        _ = try await repo.updateRecipe(id: "r1", RecipeUpdate(steps: [RecipeStepInput(text: "Fry")]))
        await harness.syncManager.drainPendingQueue()

        let bodies = harness.recordedBodies("PATCH", "/api/recipes/r1")
        #expect(bodies.count == 2)
        let first = try #require(JSONSerialization.jsonObject(with: bodies[0]) as? [String: Any])
        #expect(first.keys.contains("steps") == false)
        let second = try #require(JSONSerialization.jsonObject(with: bodies[1]) as? [String: Any])
        let steps = try #require(second["steps"] as? [[String: Any]])
        #expect(steps.map { $0["text"] as? String } == ["Fry"])
    }

    @Test("An edit to a still-queued create folds its steps into the create body")
    func editBeforeUploadCoalescesSteps() async throws {
        let harness = try RepositoryHarness(online: false)
        let repo = harness.recipeRepository
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        let temp = try await repo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: Self.oneIngredient,
            steps: [RecipeStepInput(text: "Chop")]
        ))

        _ = try await repo.updateRecipe(id: temp.id, RecipeUpdate(
            steps: [RecipeStepInput(text: "Fry"), RecipeStepInput(text: "Serve")]
        ))
        #expect(repo.recipe(id: temp.id)?.steps?.map(\.text) == ["Fry", "Serve"])

        harness.connectivity.isOnline = true
        await harness.syncManager.drainPendingQueue()

        let body = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let sent = try JSONDecoder().decode(RecipeCreate.self, from: body)
        #expect(sent.steps?.map(\.text) == ["Fry", "Serve"])
        #expect(harness.recordedRequests.contains("PATCH /api/recipes/\(temp.id)") == false)
    }

    @Test("Offline create replays with its steps after an ingredient's food id is remapped")
    func offlineCreateChainKeepsSteps() async throws {
        let harness = try RepositoryHarness(online: false)
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """)
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        let food = try await harness.foodRepository.createFood(FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g, calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        ))
        _ = try await harness.recipeRepository.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: food.id, quantity: 80, servingUnit: .g)],
            steps: [RecipeStepInput(text: "Stir", imageUrl: "/uploads/a1b2.webp")]
        ))

        harness.connectivity.isOnline = true
        await harness.syncManager.drainPendingQueue()

        let body = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let sent = try JSONDecoder().decode(RecipeCreate.self, from: body)
        #expect(sent.ingredients.map(\.foodId) == ["f-server"])
        #expect(sent.steps == [RecipeStepInput(text: "Stir", imageUrl: "/uploads/a1b2.webp")])
    }

    // MARK: - List refresh

    @Test("A list refresh keeps cached steps while the count matches and drops stale ones")
    func listRefreshPreservesSteps() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        try harness.context.insert(LocalRecipe(recipe: recipe(
            id: "same", steps: [(text: "Chop", imageUrl: nil), (text: "Fry", imageUrl: nil)]
        )))
        try harness.context.insert(LocalRecipe(recipe: recipe(id: "changed", steps: [(text: "Chop", imageUrl: nil)])))
        try harness.context.insert(LocalRecipe(recipe: recipe(id: "emptied", steps: [(text: "Chop", imageUrl: nil)])))
        try harness.context.insert(LocalRecipe(recipe: recipe(id: "unknown")))
        try harness.context.save()
        harness.stub("GET", "/api/recipes", json: """
        {"recipes": [
            {"id": "same", "name": "Bowl", "totalServings": 2, "isFavorite": false, "stepCount": 2},
            {"id": "changed", "name": "Bowl", "totalServings": 2, "isFavorite": false, "stepCount": 3},
            {"id": "emptied", "name": "Bowl", "totalServings": 2, "isFavorite": false, "stepCount": 0},
            {"id": "unknown", "name": "Bowl", "totalServings": 2, "isFavorite": false}
        ]}
        """)

        try await repo.refresh()

        #expect(repo.recipe(id: "same")?.steps?.map(\.text) == ["Chop", "Fry"])
        #expect(repo.recipe(id: "changed")?.steps == nil)
        #expect(repo.recipe(id: "changed")?.stepCount == 3)
        #expect(repo.recipe(id: "emptied")?.steps == [])
        #expect(repo.recipe(id: "unknown")?.steps == nil)
    }

    @Test("A list refresh keeps cached ingredients, but takes the server's macros")
    func listRefreshPreservesIngredients() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        let base = try recipe(id: "r1", steps: [(text: "Chop", imageUrl: nil)])
        let cached = try JSONPatch.merged(Recipe.self, base: base, patch: [
            "ingredients": [["foodId": "f1", "quantity": 100, "servingUnit": "g", "sortOrder": 0]],
        ])
        harness.context.insert(LocalRecipe(recipe: cached))
        try harness.context.save()
        harness.stub("GET", "/api/recipes", json: """
        {"recipes": [{
            "id": "r1", "name": "Bowl", "totalServings": 2, "isFavorite": false,
            "calories": 640, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1, "stepCount": 1
        }]}
        """)

        try await repo.refresh()

        let refreshed = try #require(repo.recipe(id: "r1"))
        #expect(refreshed.ingredients?.map(\.foodId) == ["f1"])
        #expect(refreshed.steps?.map(\.text) == ["Chop"])
        #expect(refreshed.calories == 640)
    }

    // MARK: - Duplicate

    @Test("Duplicating copies the steps in order and shares server-hosted photos")
    func duplicateCopiesSteps() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = harness.recipeRepository
        let source = try await repo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: Self.oneIngredient,
            imageUrl: "/uploads/cover.webp",
            steps: [
                RecipeStepInput(text: "Chop", imageUrl: "/uploads/a1b2.webp"),
                RecipeStepInput(text: "Fry"),
            ]
        ))

        let copy = try await repo.duplicateRecipe(id: source.id, name: "Bowl (copy)")

        #expect(copy.id != source.id)
        #expect(copy.imageUrl == nil)
        #expect(copy.orderedSteps.map(\.text) == ["Chop", "Fry"])
        #expect(copy.orderedSteps.map(\.imageUrl) == ["/uploads/a1b2.webp", nil])
        #expect(copy.stepCount == 2)
        // Fresh step rows, not the source's.
        #expect(Set(copy.orderedSteps.map(\.id)).isDisjoint(with: Set(source.orderedSteps.map(\.id))))
        #expect(repo.recipe(id: source.id)?.steps?.count == 2)
    }

    @Test("A duplicate queued for upload carries the steps")
    func duplicateSendsSteps() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-copy", "userId": "u1", "name": "Bowl (copy)", "totalServings": 2, "isFavorite": false}}
        """)
        let base = try recipe(id: "r1", steps: [(text: "Chop", imageUrl: "/uploads/a1b2.webp")])
        let source = try JSONPatch.merged(Recipe.self, base: base, patch: [
            "ingredients": [["foodId": "f1", "quantity": 100, "servingUnit": "g", "sortOrder": 0]],
        ])
        harness.context.insert(LocalRecipe(recipe: source))
        try harness.context.save()

        _ = try await repo.duplicateRecipe(id: "r1", name: "Bowl (copy)")
        await harness.syncManager.drainPendingQueue()

        let body = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let sent = try JSONDecoder().decode(RecipeCreate.self, from: body)
        #expect(sent.steps == [RecipeStepInput(text: "Chop", imageUrl: "/uploads/a1b2.webp")])
    }

    // MARK: - Sign-in migration

    @Test("Migrating a Local-mode recipe uploads its steps with it")
    func migrationUploadsSteps() async throws {
        let harness = try RepositoryHarness(mode: .local)
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        // No ingredients: the migration doesn't depend on foods to carry steps.
        try harness.context.insert(LocalRecipe(recipe: recipe(
            id: "temp_recipe1",
            steps: [(text: "  Chop  ", imageUrl: nil), (text: "Fry", imageUrl: nil)]
        )))
        try harness.context.save()

        let migrator = harness.migrator
        await migrator.migrate()

        #expect(migrator.state == .completed)
        let body = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let sent = try JSONDecoder().decode(RecipeCreate.self, from: body)
        #expect(sent.steps == [RecipeStepInput(text: "Chop"), RecipeStepInput(text: "Fry")])
    }

    // MARK: - Cooking mode

    @Test("Cooking mode scales ingredient amounts by the chosen servings")
    func cookingScalesQuantities() {
        #expect(RecipeCookingView.scaledQuantity(200, servings: 4, baseServings: 2) == 400)
        #expect(RecipeCookingView.scaledQuantity(200, servings: 1, baseServings: 2) == 100)
        #expect(RecipeCookingView.scaledQuantity(150, servings: 3, baseServings: 3) == 150)
        // A non-positive base falls back to one serving instead of dividing by zero.
        #expect(RecipeCookingView.scaledQuantity(50, servings: 2, baseServings: 0) == 100)
    }
}
