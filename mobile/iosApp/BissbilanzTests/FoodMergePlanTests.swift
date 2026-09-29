@testable import Bissbilanz
import Foundation
import Testing

/// `FoodMergePlan` previews what `POST /api/foods/merge` will do, so these
/// mirror the rules in `src/lib/server/food-merge.ts`.
@Suite("FoodMergePlan")
struct FoodMergePlanTests {
    private func makeFood(id: String, _ fields: [String: Any] = [:]) throws -> Food {
        var base: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": "Monster Ultra",
            "servingSize": 100,
            "servingUnit": "ml",
            "calories": 2,
            "protein": 0,
            "carbs": 0.9,
            "fat": 0,
            "fiber": 0,
            "isFavorite": false,
        ]
        base.merge(fields) { _, new in new }
        return try JSONPatch.decode(Food.self, from: base)
    }

    private func diff(_ key: String, in diffs: [FoodMergeFieldDiff]) -> FoodMergeFieldDiff? {
        diffs.first { $0.key == key }
    }

    @Test("identical foods have no differing fields")
    func identicalFoods() throws {
        let foods = try [makeFood(id: "a"), makeFood(id: "b")]
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a")
        #expect(diffs.filter(\.differs).isEmpty)
    }

    @Test("keeper value wins over a source value")
    func keeperWins() throws {
        let foods = try [makeFood(id: "a"), makeFood(id: "b", ["calories": 10])]
        let calories = try #require(diff("calories", in: FoodMergePlan.diffs(foods: foods, keeperId: "a")))
        #expect(calories.differs)
        #expect(calories.result == .number(2))
        #expect(calories.resultFoodId == "a")
    }

    @Test("an empty keeper field is filled from the source")
    func backfill() throws {
        let foods = try [makeFood(id: "a", ["barcode": ""]), makeFood(id: "b", ["barcode": "5060337502238"])]
        let barcode = try #require(diff("barcode", in: FoodMergePlan.diffs(foods: foods, keeperId: "a")))
        #expect(barcode.result == .text("5060337502238"))
        #expect(barcode.resultFoodId == "b")
        #expect(!barcode.isOverridden)
    }

    @Test("favorite is kept when any food is a favorite")
    func favoriteIsOred() throws {
        let foods = try [makeFood(id: "a"), makeFood(id: "b", ["isFavorite": true])]
        let favorite = try #require(diff("isFavorite", in: FoodMergePlan.diffs(foods: foods, keeperId: "a")))
        #expect(favorite.result == .flag(true))
    }

    @Test("a picked value overrides the automatic result")
    func override() throws {
        let foods = try [makeFood(id: "a"), makeFood(id: "b", ["calories": 10, "name": "Monster White"])]
        let overrides = ["calories": "b", "name": "b"]
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a", overrides: overrides)
        #expect(diff("calories", in: diffs)?.result == .number(10))
        #expect(diff("name", in: diffs)?.isOverridden == true)
        let submission = FoodMergePlan.submission(foods: foods, keeperId: "a", overrides: overrides)
        #expect(submission.keeperId == "a")
        #expect(submission.sourceIds == ["b"])
        #expect(submission.overrides == ["calories": .number(10), "name": .text("Monster White")])
    }

    @Test("picking the value the merge keeps anyway sends no override")
    func redundantOverride() throws {
        let foods = try [makeFood(id: "a"), makeFood(id: "b", ["calories": 10])]
        let submission = FoodMergePlan.submission(foods: foods, keeperId: "a", overrides: ["calories": "a"])
        #expect(submission.overrides.isEmpty)
    }

    private func servingPick(_ foodId: String) -> [String: String] {
        ["servingSize": foodId, "servingUnit": foodId]
    }

    /// A = "El Tony Mate Zero" 100 ml, 1 kcal, 0.3 g protein;
    /// B = "Mate Zero" 330 ml, 3 kcal, 1.7 g protein.
    private func mateFoods() throws -> [Food] {
        try [
            makeFood(id: "a", ["name": "El Tony Mate Zero", "calories": 1, "protein": 0.3, "carbs": 0]),
            makeFood(id: "b", ["name": "Mate Zero", "servingSize": 330, "calories": 3, "protein": 1.7, "carbs": 0]),
        ]
    }

    @Test("without a serving pick the keeper's serving and nutrients stay")
    func keeperServingStays() throws {
        let foods = try mateFoods()
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a")
        #expect(diff("servingSize", in: diffs)?.result == .number(100))
        #expect(diff("calories", in: diffs)?.result == .number(1))
        let submission = FoodMergePlan.submission(foods: foods, keeperId: "a", overrides: [:])
        #expect(submission.keeperId == "a")
        #expect(submission.sourceIds == ["b"])
        #expect(submission.overrides.isEmpty)
    }

    @Test("serving can be taken from another food and nutrients rescale to it")
    func servingPickRescalesNutrients() throws {
        let foods = try mateFoods()
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a", overrides: servingPick("b"))
        let size = try #require(diff("servingSize", in: diffs))
        #expect(size.result == .number(330))
        #expect(size.resultFoodId == "b")
        #expect(size.isOverridden)

        let calories = try #require(diff("calories", in: diffs))
        #expect(calories.result == .number(3.3))
        #expect(calories.resultFoodId == "a")
        #expect(calories.values["a"] == .number(3.3))
        #expect(calories.values["b"] == .number(3))
        #expect(calories.scaledFoodIds == ["a"])
        #expect(diff("protein", in: diffs)?.result == .number(0.99))
    }

    @Test("a nutrient can be taken from the other food, rescaled to the chosen serving")
    func nutrientPickRescales() throws {
        let foods = try mateFoods()
        // Keep A's 100 ml serving but take B's calories: 3 kcal / 330 ml is 0.909 kcal / 100 ml.
        let overrides = ["calories": "b"]
        #expect(FoodMergePlan.canPick(key: "calories", from: "b", foods: foods, keeperId: "a", overrides: overrides))
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a", overrides: overrides)
        let calories = try #require(diff("calories", in: diffs))
        #expect(calories.result == .number(0.909))
        #expect(calories.resultFoodId == "b")
        #expect(calories.isOverridden)
    }

    @Test("a serving pick makes that food the server keeper and the other choices become overrides")
    func servingPickSubmission() throws {
        let foods = try mateFoods()
        let submission = FoodMergePlan.submission(foods: foods, keeperId: "a", overrides: servingPick("b"))
        #expect(submission.keeperId == "b")
        #expect(submission.sourceIds == ["a"])
        #expect(submission.overrides == [
            "name": .text("El Tony Mate Zero"),
            "calories": .number(3.3),
            "protein": .number(0.99),
        ])
    }

    @Test("picking the serving of the food already kept sends no serving override")
    func servingPickOfKeeper() throws {
        let foods = try mateFoods()
        let submission = FoodMergePlan.submission(foods: foods, keeperId: "b", overrides: servingPick("b"))
        #expect(submission.keeperId == "b")
        #expect(submission.overrides.isEmpty)
    }

    @Test("convertible units rescale nutrients")
    func convertibleUnits() throws {
        let foods = try [
            makeFood(id: "a", ["servingSize": 500, "servingUnit": "g", "calories": 100]),
            makeFood(id: "b", ["servingSize": 1, "servingUnit": "kg", "calories": 250]),
        ]
        #expect(FoodMergePlan.servingNote(foods: foods, servingFoodId: "a") == .convertibleUnits)
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a", overrides: ["calories": "b"])
        let calories = try #require(diff("calories", in: diffs))
        #expect(calories.result == .number(125))
        #expect(calories.values["b"] == .number(125))
    }

    @Test("incompatible units keep nutrients with the food whose serving is kept")
    func incompatibleUnitsLockNutrients() throws {
        let foods = try [
            makeFood(id: "a"),
            makeFood(id: "b", ["servingSize": 100, "servingUnit": "g", "calories": 10, "name": "Can"]),
        ]
        #expect(FoodMergePlan.scaleFactor(from: foods[1], to: foods[0]) == nil)
        #expect(FoodMergePlan.servingNote(foods: foods, servingFoodId: "a") == .incompatibleUnits)
        #expect(!FoodMergePlan.canPick(key: "calories", from: "b", foods: foods, keeperId: "a"))
        #expect(FoodMergePlan.canPick(key: "servingSize", from: "b", foods: foods, keeperId: "a"))
        #expect(FoodMergePlan.canPick(key: "name", from: "b", foods: foods, keeperId: "a"))
        let locked = FoodMergePlan.submission(foods: foods, keeperId: "a", overrides: ["calories": "b"])
        #expect(locked.overrides.isEmpty)

        // Taking B's serving moves the nutrients with it: A's can't be converted to grams.
        let diffs = FoodMergePlan.diffs(foods: foods, keeperId: "a", overrides: servingPick("b"))
        let calories = try #require(diff("calories", in: diffs))
        #expect(calories.result == .number(10))
        #expect(calories.resultFoodId == "b")
        let submission = FoodMergePlan.submission(foods: foods, keeperId: "a", overrides: servingPick("b"))
        #expect(submission.keeperId == "b")
        #expect(submission.overrides["calories"] == nil)
        #expect(submission.overrides["name"] == .text("Monster Ultra"))
    }

    @Test("serving note describes how the servings relate")
    func servingNote() throws {
        let same = try [makeFood(id: "a"), makeFood(id: "b")]
        #expect(FoodMergePlan.servingNote(foods: same, servingFoodId: "a") == .same)
        let sameUnit = try [makeFood(id: "a"), makeFood(id: "b", ["servingSize": 330])]
        #expect(FoodMergePlan.servingNote(foods: sameUnit, servingFoodId: "a") == .sameUnit)
    }

    @Test("merge request leaves overrides out when there are none")
    func requestEncoding() throws {
        let plain = try JSONPatch.dictionary(of: FoodMergeRequest(keeperId: "a", sourceIds: ["b"]))
        #expect(plain["overrides"] == nil)

        let withOverrides = try JSONPatch.dictionary(of: FoodMergeRequest(
            keeperId: "a",
            sourceIds: ["b"],
            overrides: ["calories": .number(10), "barcode": .text("123"), "isFavorite": .flag(true)]
        ))
        let overrides = try #require(withOverrides["overrides"] as? [String: Any])
        #expect(overrides["calories"] as? Double == 10)
        #expect(overrides["barcode"] as? String == "123")
        #expect(overrides["isFavorite"] as? Bool == true)
    }
}
