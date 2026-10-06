@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// Recipe labels: the same English nouns foods carry, decoded from the recipe
/// endpoints, mirrored on `LocalRecipe`, searched with the food tiers, written
/// through the sync queue and fed by the one `FoodLabeler`. The server side is
/// `PUT /api/recipes/{id}/labels`.
@Suite("Recipe labels")
@MainActor
struct RecipeLabelTests {
    private static let oneIngredient = [RecipeIngredientInput(foodId: "f1", quantity: 100, servingUnit: .g)]

    private func recipe(
        id: String,
        name: String,
        labels: [String]? = nil,
        ingredientFoodIds: [String]? = nil
    ) throws -> Recipe {
        var dict: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": name,
            "totalServings": 2,
            "isFavorite": false,
        ]
        if let labels { dict["labels"] = labels }
        if let ingredientFoodIds {
            dict["ingredients"] = ingredientFoodIds.enumerated().map { index, foodId -> [String: Any] in
                ["foodId": foodId, "quantity": 100, "servingUnit": "g", "sortOrder": index]
            }
        }
        return try JSONPatch.decode(Recipe.self, from: dict)
    }

    private func insert(_ recipe: Recipe, into harness: RepositoryHarness) throws {
        harness.context.insert(LocalRecipe(recipe: recipe))
        try harness.context.save()
    }

    // MARK: - Models

    @Test("Recipe labels decode from the list and detail shapes, and are nil on older servers")
    func decodesLabels() throws {
        let withLabels = try JSONDecoder().decode(RecipeResponse.self, from: Data("""
        {"recipe": {"id": "r1", "name": "Soup", "totalServings": 2, "isFavorite": false,
                    "labels": ["soup", "tomato"]}}
        """.utf8))
        #expect(withLabels.recipe.labels == ["soup", "tomato"])

        let without = try JSONDecoder().decode(RecipesResponse.self, from: Data("""
        {"recipes": [{"id": "r1", "name": "Soup", "totalServings": 2, "isFavorite": false}]}
        """.utf8))
        #expect(without.recipes.first?.labels == nil)
    }

    @Test("The labels response is the food envelope")
    func decodesSetResponse() throws {
        let response = try JSONDecoder().decode(
            RecipeLabelsSetResponse.self,
            from: Data(#"{"labels": ["soup"], "dropped": ["extra"]}"#.utf8)
        )
        #expect(response.labels == ["soup"])
        #expect(response.dropped == ["extra"])
    }

    @Test("LocalRecipe mirrors the labels in a column and refreshes them on update")
    func localRecipeMirrorsLabels() throws {
        let row = LocalRecipe(recipe: try recipe(id: "r1", name: "Soup", labels: ["soup"]))
        #expect(row.labels == ["soup"])
        #expect(row.toRecipe()?.labels == ["soup"])

        row.update(from: try recipe(id: "r1", name: "Soup", labels: ["soup", "tomato"]))
        #expect(row.labels == ["soup", "tomato"])

        row.update(from: try recipe(id: "r1", name: "Soup"))
        #expect(row.labels.isEmpty)
    }

    @Test("Replacing a recipe's ingredients keeps its labels")
    func applyingIngredientsKeepsLabels() throws {
        let source = try recipe(id: "r1", name: "Soup", labels: ["soup"])
        let updated = RecipeRepository.applying(ingredients: [], to: source)
        #expect(updated.labels == ["soup"])
    }

    @Test("A drained create keeps the labels the temp row already carried")
    func replaceRecipeKeepsLocalLabels() throws {
        let harness = try RepositoryHarness()
        try insert(try recipe(id: "temp_1", name: "Soup", labels: ["soup"]), into: harness)

        LocalRemap.replaceRecipe(id: "temp_1", with: try recipe(id: "r-1", name: "Soup"), in: harness.context)

        #expect(LocalRemap.recipeRow(id: "temp_1", in: harness.context) == nil)
        #expect(LocalRemap.recipeRow(id: "r-1", in: harness.context)?.labels == ["soup"])

        LocalRemap.replaceRecipe(
            id: "r-1", with: try recipe(id: "r-1", name: "Soup", labels: ["dish"]), in: harness.context
        )
        #expect(LocalRemap.recipeRow(id: "r-1", in: harness.context)?.labels == ["dish"])
    }

    // MARK: - Search

    @Test("Search ranks name matches ahead of label matches, each alphabetical")
    func searchTiers() throws {
        let recipes = [
            try recipe(id: "r1", name: "Tomatensuppe", labels: ["soup", "tomato"]),
            try recipe(id: "r2", name: "Soup of the Day"),
            try recipe(id: "r3", name: "Ajvar", labels: ["soup"]),
            try recipe(id: "r4", name: "Pasta", labels: ["pasta"]),
        ]
        #expect(RecipeSearch.matching(recipes, query: "soup").map(\.id) == ["r2", "r3", "r1"])
        // Plural and case fold through the same normalizer as the stored label.
        #expect(RecipeSearch.matching(recipes, query: "Soups").map(\.id) == ["r3", "r1"])
        #expect(RecipeSearch.matching(recipes, query: "pasta").map(\.id) == ["r4"])
        #expect(RecipeSearch.matching(recipes, query: "pizza").isEmpty)
        #expect(RecipeSearch.matching(recipes, query: "  ").isEmpty)
    }

    @Test("A list filter matches by name or label and lets an empty query through")
    func filterMatches() throws {
        let soup = try recipe(id: "r1", name: "Tomatensuppe", labels: ["soup"])
        #expect(RecipeSearch.matches(soup, query: "suppe"))
        #expect(RecipeSearch.matches(soup, query: "soup"))
        #expect(!RecipeSearch.matches(soup, query: "pasta"))
        #expect(RecipeSearch.matches(soup, query: ""))
        #expect(!RecipeSearch.matches(try recipe(id: "r2", name: "Kuchen"), query: "soup"))
    }

    // MARK: - Repository

    @Test("Only recipes without labels are listed for the sweep")
    func unlabeledLocalRecipes() throws {
        let harness = try RepositoryHarness()
        try insert(try recipe(id: "r1", name: "Soup", labels: ["soup"]), into: harness)
        try insert(try recipe(id: "r2", name: "Bowl"), into: harness)
        try insert(try recipe(id: "r3", name: "Cake", labels: []), into: harness)

        #expect(harness.recipeRepository.unlabeledLocalRecipes().map(\.id) == ["r2", "r3"])
    }

    @Test("Setting labels updates the row optimistically and queues a user write")
    func setLabelsQueuesWrite() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("PUT", "/api/recipes/r-1/labels", json: #"{"labels": ["soup", "tomato"], "dropped": []}"#)
        try insert(try recipe(id: "r-1", name: "Soup"), into: harness)

        let updated = try await repo.setLabels(id: "r-1", labels: ["Soups", "TOMATO", "soups"])
        #expect(updated.labels == ["soup", "tomato"])
        #expect(repo.recipe(id: "r-1")?.labels == ["soup", "tomato"])
        #expect(RecipeSearch.matching(repo.recipes(), query: "tomato").map(\.id) == ["r-1"])
        #expect(harness.syncManager.queuedRows().count == 1)

        let drained = await harness.syncManager.drainPendingQueue()
        #expect(drained == 1)
        #expect(harness.recordedRequests == ["PUT /api/recipes/r-1/labels"])
        let body = try #require(harness.recordedBodies("PUT", "/api/recipes/r-1/labels").first)
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["labels"] as? [String] == ["Soups", "TOMATO", "soups"])
        #expect(json["source"] == nil)
        #expect(json["mode"] == nil)
        let headers = try #require(harness.recordedHeaders("PUT", "/api/recipes/r-1/labels").first)
        #expect(headers["X-Client-Edited-At"] != nil)
        #expect(harness.syncManager.errors.isEmpty)
    }

    @Test("Setting labels on a missing recipe fails without queueing anything")
    func setLabelsMissingRecipe() async throws {
        let harness = try RepositoryHarness()
        await #expect(throws: APIError.self) {
            try await harness.recipeRepository.setLabels(id: "nope", labels: ["soup"])
        }
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Generated labels merge, normalize, cap and sort, then queue an llm extend write")
    func addGeneratedLabelsMergesAndCaps() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("PUT", "/api/recipes/r-1/labels", json: #"{"labels": [], "dropped": []}"#)
        try insert(try recipe(id: "r-1", name: "Soup", labels: ["soup"]), into: harness)

        let generated = (1 ... 25).map { "label\($0)" } + ["Soups"]
        let updated = try await repo.addGeneratedLabels(id: "r-1", labels: generated)

        #expect(updated.labels?.count == LabelNormalizer.maxLabelsPerFood)
        #expect(updated.labels?.contains("soup") == true)
        #expect(updated.labels?.contains("label25") == false)
        #expect(updated.labels == updated.labels?.sorted())

        let drained = await harness.syncManager.drainPendingQueue()
        #expect(drained == 1)
        let body = try #require(harness.recordedBodies("PUT", "/api/recipes/r-1/labels").first)
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["source"] as? String == "llm")
        #expect(json["mode"] as? String == "extend")
        // A machine write never claims to be the device's own edit.
        let headers = try #require(harness.recordedHeaders("PUT", "/api/recipes/r-1/labels").first)
        #expect(headers["X-Client-Edited-At"] == nil)
        #expect(harness.syncManager.errors.isEmpty)
    }

    @Test("Suggestions that add nothing leave the recipe and the queue untouched")
    func addGeneratedLabelsNoOpsWhenEmpty() async throws {
        let harness = try RepositoryHarness()
        try insert(try recipe(id: "r-1", name: "Soup", labels: ["soup"]), into: harness)

        let updated = try await harness.recipeRepository.addGeneratedLabels(id: "r-1", labels: [])
        #expect(updated.labels == ["soup"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Labels written for a recipe created offline follow it to the server id")
    func labelsFollowTempRecipeCreate() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        harness.stub("PUT", "/api/recipes/r-server/labels", json: #"{"labels": ["bowl"], "dropped": []}"#)

        let temp = try await repo.createRecipe(RecipeCreate(
            name: "Bowl", totalServings: 2, ingredients: Self.oneIngredient
        ))
        _ = try await repo.setLabels(id: temp.id, labels: ["bowl"])
        #expect(harness.syncManager.queuedRows().count == 2)

        let drained = await harness.syncManager.drainPendingQueue()
        #expect(drained == 2)
        #expect(harness.recordedRequests == ["POST /api/recipes", "PUT /api/recipes/r-server/labels"])
        #expect(harness.syncManager.parkedRows().isEmpty)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(repo.recipe(id: temp.id)?.id == "r-server")
        #expect(repo.recipe(id: "r-server")?.labels == ["bowl"])
    }

    @Test("A temp recipe id held across a drain still takes generated labels")
    func staleTempRecipeIdTakesLabels() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server-stale", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        harness.stub("PUT", "/api/recipes/r-server-stale/labels", json: #"{"labels": [], "dropped": []}"#)

        let stale = try await repo.createRecipe(RecipeCreate(
            name: "Bowl", totalServings: 2, ingredients: Self.oneIngredient
        ))
        await harness.syncManager.drainPendingQueue()

        let labelled = try await repo.addGeneratedLabels(id: stale.id, labels: ["bowl"])
        #expect(labelled.id == "r-server-stale")
        await harness.syncManager.drainPendingQueue()
        #expect(harness.recordedRequests.contains("PUT /api/recipes/r-server-stale/labels"))
        #expect(harness.syncManager.parkedRows().isEmpty)
    }

    @Test("Recipe label writes remap, round trip and report the recipes table")
    func syncOperations() throws {
        let set = SyncOperation.setRecipeLabels(id: "temp-1", labels: ["soup"])
        guard case let .setRecipeLabels(id, labels)? = set.remappingReferences(from: "temp-1", to: "r-1") else {
            Issue.record("expected a remapped setRecipeLabels")
            return
        }
        #expect(id == "r-1")
        #expect(labels == ["soup"])
        #expect(set.remappingReferences(from: "other", to: "x") == nil)
        #expect(set.affectedTable == "recipes")
        #expect(set.affectedId == "temp-1")
        #expect(set.typeName == "set_recipe_labels")

        let generated = SyncOperation.addGeneratedRecipeLabels(id: "temp-1", labels: ["soup"])
        guard case let .addGeneratedRecipeLabels(genId, genLabels)? =
            generated.remappingReferences(from: "temp-1", to: "r-1")
        else {
            Issue.record("expected a remapped addGeneratedRecipeLabels")
            return
        }
        #expect(genId == "r-1")
        #expect(genLabels == ["soup"])
        #expect(generated.affectedTable == "recipes")
        #expect(generated.typeName == "add_generated_recipe_labels")

        for op in [set, generated] {
            let decoded = try JSONDecoder().decode(SyncOperation.self, from: JSONEncoder().encode(op))
            #expect(decoded.typeName == op.typeName)
            #expect(decoded.affectedId == "temp-1")
        }
    }

    // MARK: - Labeller input

    @Test("A recipe's ingredient names come from the food mirror in ingredient order")
    func ingredientFoodNames() throws {
        let harness = try RepositoryHarness()
        for (id, name) in [("f1", "Tomato"), ("f2", "Basil")] {
            let food = try FoodRepository.makeFood(from: FoodCreate(
                name: name, servingSize: 100, servingUnit: .g,
                calories: 1, protein: 0, carbs: 0, fat: 0, fiber: 0
            ), id: id)
            harness.context.insert(LocalFood(food: food))
        }
        try harness.context.save()
        let soup = try recipe(id: "r1", name: "Soup", ingredientFoodIds: ["f2", "missing", "f1"])

        #expect(harness.recipeRepository.ingredientFoodNames(of: soup) == ["Basil", "Tomato"])
        #expect(try harness.recipeRepository.ingredientFoodNames(of: recipe(id: "r2", name: "Bare")).isEmpty)
    }

    @Test("The labeller's vocabulary counts recipe labels next to food labels")
    func vocabularyIncludesRecipeLabels() throws {
        let harness = try RepositoryHarness()
        try insert(try recipe(id: "r1", name: "Soup", labels: ["soup", "tomato"]), into: harness)
        try insert(try recipe(id: "r2", name: "Stew", labels: ["soup"]), into: harness)

        #expect(harness.foodRepository.mostUsedLocalLabels() == ["soup", "tomato"])
    }

    @Test("A recipe's prompt carries its name and ingredient names, not a serving unit or brand")
    func recipePrompt() {
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(
                recipeName: "Tomatensuppe",
                ingredientNames: ["Tomaten", "Basilikum", "Sahne"]
            ),
            vocabulary: ["soup"]
        )
        #expect(prompt.contains("Recipe name: Tomatensuppe"))
        #expect(prompt.contains("Ingredients: Tomaten, Basilikum, Sahne"))
        #expect(prompt.contains("soup"))
        #expect(!prompt.contains("Serving unit"))
        #expect(!prompt.contains("Brand:"))
        #expect(!prompt.contains("Food name"))
    }

    @Test("A recipe's ingredient list is truncated like a food's ingredients text")
    func recipePromptTruncatesIngredients() {
        let names = (1 ... 100).map { "Ingredient\($0)" }
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(recipeName: "Big", ingredientNames: names),
            vocabulary: []
        )
        let line = prompt.split(separator: "\n").first { $0.hasPrefix("Ingredients: ") }
        #expect((line?.count ?? 0) <= "Ingredients: ".count + 300)
    }

    @Test("A food's prompt is unchanged: Food name, serving unit, no recipe lines")
    func foodPromptUnchanged() {
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(name: "Coca-Cola", brand: "Coca-Cola", servingUnit: .ml, ingredientsText: nil),
            vocabulary: []
        )
        #expect(prompt.contains("Food name: Coca-Cola"))
        #expect(prompt.contains("Serving unit"))
        #expect(!prompt.contains("Recipe name"))
    }

    @Test("Recipes get their own model instructions, foods keep theirs")
    func instructionsPerSubject() {
        let food = FoodLabeler.instructions(for: .food)
        let recipe = FoodLabeler.instructions(for: .recipe)
        #expect(food.contains("labelling a food"))
        #expect(recipe.contains("labelling a recipe"))
        #expect(recipe != food)
    }
}
