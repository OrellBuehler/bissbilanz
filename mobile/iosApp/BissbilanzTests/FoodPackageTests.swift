@testable import Bissbilanz
import Foundation
import Testing

@Suite("Food package resolutions")
struct FoodPackageResolutionTests {
    private let all = FoodPackageAction.allCases
    private var conflicts: [FoodPackageResolutionModel.Conflict] {
        [
            .init(ref: "f1", existingId: "a", allowed: all),
            .init(ref: "f2", existingId: "a", allowed: all),
            .init(ref: "f3", existingId: "b", allowed: [.skip, .keepBoth]),
        ]
    }

    @Test("Every conflict starts as skip")
    func defaultsToSkip() {
        #expect(FoodPackageResolutionModel.initial(conflicts) == ["f1": .skip, "f2": .skip, "f3": .skip])
    }

    @Test("Only one replace per existing item")
    func onlyOneReplace() {
        var state = FoodPackageResolutionModel.initial(conflicts)
        state = FoodPackageResolutionModel.set(state, conflicts: conflicts, ref: "f1", action: .replace)
        state = FoodPackageResolutionModel.set(state, conflicts: conflicts, ref: "f2", action: .replace)
        #expect(state["f1"] == .skip)
        #expect(state["f2"] == .replace)
    }

    @Test("A disallowed action is ignored")
    func ignoresDisallowed() {
        let state = FoodPackageResolutionModel.initial(conflicts)
        #expect(FoodPackageResolutionModel.set(state, conflicts: conflicts, ref: "f3", action: .replace) == state)
    }

    @Test("Apply to all falls back to skip")
    func applyToAll() {
        let replaced = FoodPackageResolutionModel.applyToAll(conflicts, action: .replace)
        #expect(replaced == ["f1": .replace, "f2": .skip, "f3": .skip])
        #expect(FoodPackageResolutionModel.common(conflicts, state: replaced) == nil)
        let kept = FoodPackageResolutionModel.applyToAll(conflicts, action: .keepBoth)
        #expect(FoodPackageResolutionModel.common(conflicts, state: kept) == .keepBoth)
    }

    @Test("Decodes a preview and encodes the resolutions the server expects")
    func roundTrip() throws {
        let json = """
        {"packageHash":"h","formatVersion":1,"exportedAt":null,
         "totals":{"foods":1,"recipes":0,"images":0},
         "newFoods":{"count":0,"ingredientOnly":0,"samples":[]},
         "newRecipes":{"count":0,"samples":[]},
         "conflicts":{"foods":[{"ref":"f1","reason":"barcode",
           "incoming":{"name":"Oats","brand":null,"servingSize":100,"servingUnit":"g","calories":370,
             "protein":13,"carbs":60,"fat":7,"fiber":10,"barcode":"1","labels":[],"imageUrl":null},
           "existing":{"id":"00000000-0000-0000-0000-000000000001","name":"Hafer","brand":null,
             "servingSize":100,"servingUnit":"g","calories":370,"protein":13,"carbs":60,"fat":7,
             "fiber":10,"barcode":"1","labels":[],"imageUrl":null,"entryCount":2,"recipeCount":0},
           "alsoMatches":[],"allowed":["skip","replace","keep_both"],
           "notes":["replace_changes_history"],"targetGroup":null}],"recipes":[]},
         "issues":[]}
        """
        let preview = try JSONDecoder().decode(FoodPackagePreview.self, from: Data(json.utf8))
        #expect(preview.conflicts.foods.first?.allowed == [.skip, .replace, .keepBoth])
        let resolutions = FoodPackageResolutionModel.resolutions(
            for: preview, foods: ["f1": .keepBoth], recipes: [:]
        )
        let encoded = try #require(String(data: JSONEncoder().encode(resolutions), encoding: .utf8))
        #expect(encoded.contains("\"action\":\"keep_both\""))
        #expect(encoded.contains("\"existingId\":\"00000000-0000-0000-0000-000000000001\""))
    }

    private static let previewWithItems = """
    {"packageHash":"h","formatVersion":1,"exportedAt":null,
     "totals":{"foods":3,"recipes":1,"images":0},
     "newFoods":{"count":3,"ingredientOnly":2,"samples":[],"items":[
       {"ref":"f1","role":"selected","name":"Oats","brand":"Alnatura","servingSize":100,"servingUnit":"g",
        "calories":372,"recipes":[]},
       {"ref":"f2","role":"ingredient","name":"Milk","brand":null,"servingSize":100,"servingUnit":"ml",
        "calories":64,"recipes":[{"ref":"r1","name":"Porridge"}]}]},
     "newRecipes":{"count":1,"samples":[]},
     "conflicts":{"foods":[],"recipes":[]},"issues":[]}
    """

    @Test("Decodes the new foods of a preview")
    func newFoodItems() throws {
        let preview = try JSONDecoder().decode(FoodPackagePreview.self, from: Data(Self.previewWithItems.utf8))
        let items = preview.newFoods.items
        #expect(items.map(\.ref) == ["f1", "f2"])
        #expect(items[0].brand == "Alnatura")
        #expect(!items[0].isIngredient)
        #expect(items[1].isIngredient)
        #expect(items[1].brand == nil)
        #expect(items[1].recipes == [FoodPackageNewFoodRecipe(ref: "r1", name: "Porridge")])
    }

    @Test("A server that predates the new foods list still decodes, with none")
    func missingItems() throws {
        let json = """
        {"packageHash":"h","totals":{"foods":1,"recipes":0,"images":0},
         "newFoods":{"count":1,"ingredientOnly":0,"samples":[]},"newRecipes":{"count":0,"samples":[]},
         "conflicts":{"foods":[],"recipes":[]},"issues":[]}
        """
        let preview = try JSONDecoder().decode(FoodPackagePreview.self, from: Data(json.utf8))
        #expect(preview.newFoods.count == 1)
        #expect(preview.newFoods.items.isEmpty)
    }

    @Test("Mappings are sent only for the new foods of the preview, and only when there are some")
    func mappingsEncoding() throws {
        let preview = try JSONDecoder().decode(FoodPackagePreview.self, from: Data(Self.previewWithItems.utf8))
        let plain = FoodPackageResolutionModel.resolutions(for: preview, foods: [:], recipes: [:])
        let plainJSON = try #require(String(data: JSONEncoder().encode(plain), encoding: .utf8))
        #expect(!plainJSON.contains("mappings"))

        let mapped = FoodPackageResolutionModel.resolutions(
            for: preview, foods: [:], recipes: [:], mappings: ["f2": "my-milk", "f9": "ignored"]
        )
        #expect(mapped.mappings == [FoodPackageMapping(ref: "f2", foodId: "my-milk")])
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(mapped)) as? [String: Any])
        let sent = try #require(json["mappings"] as? [[String: String]])
        #expect(sent == [["ref": "f2", "foodId": "my-milk"]])
    }

    @Test("Only a food measured in the same dimension can stand in for an incoming one")
    func mappingDimension() throws {
        let preview = try JSONDecoder().decode(FoodPackagePreview.self, from: Data(Self.previewWithItems.utf8))
        let oats = preview.newFoods.items[0]
        let milk = preview.newFoods.items[1]
        func own(_ unit: String) throws -> Food {
            try JSONPatch.decode(Food.self, from: [
                "id": "x", "userId": "", "name": "Mine", "servingSize": 100, "servingUnit": unit,
                "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1, "isFavorite": false,
            ])
        }
        #expect(try FoodPackageResolutionModel.isCompatible(oats, own("kg")))
        #expect(try !FoodPackageResolutionModel.isCompatible(oats, own("ml")))
        #expect(try FoodPackageResolutionModel.isCompatible(milk, own("fl_oz")))
        #expect(try !FoodPackageResolutionModel.isCompatible(milk, own("g")))
    }

    @Test("Package errors read as plain sentences, and a rejected file is not called a failure")
    func errorText() {
        #expect(FoodPackageErrorText.message(for: FoodPackageError.notAPackage) == L10n.foodPackageNotAPackage)
        #expect(FoodPackageErrorText.message(for: FoodPackageError.missingManifest) == L10n.foodPackageNotAPackage)
        #expect(FoodPackageErrorText.message(for: FoodPackageError.accountExport) == L10n.foodPackageAccountExport)
        #expect(FoodPackageErrorText.isStale(FoodPackageError.stalePreview))
        #expect(FoodPackageErrorText.isStale(APIError.conflict(serverNewer: false, body: nil)))
        #expect(!FoodPackageErrorText.isStale(FoodPackageError.notAPackage))
        let server = APIError.badRequest(#"{"error":"Unrecognized file: expected a Bissbilanz food package"}"#)
        #expect(FoodPackageErrorText.message(for: server, fallback: nil) == L10n.foodPackageNotAPackage)
        let other = APIError.badRequest(#"{"error":"Invalid food package: foods.0.name — Too small"}"#)
        #expect(FoodPackageErrorText.message(for: other, fallback: nil) == "Invalid food package: foods.0.name — Too small")
    }

    @Test("A picked-foods selection encodes foodIds and skips unset fields")
    func foodIdsSelection() throws {
        let selection = FoodPackageSelection(foodIds: ["a", "b"], includeRecipes: "related")
        let encoded = try #require(String(data: JSONEncoder().encode(selection), encoding: .utf8))
        #expect(encoded.contains("\"foodIds\":[\"a\",\"b\"]"))
        #expect(encoded.contains("\"includeRecipes\":\"related\""))
        #expect(!encoded.contains("recipeIds"))
        #expect(!encoded.contains("\"all\""))
    }
}
