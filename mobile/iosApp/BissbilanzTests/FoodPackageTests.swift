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
}
