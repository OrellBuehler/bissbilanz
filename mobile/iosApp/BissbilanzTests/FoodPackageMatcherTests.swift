@testable import Bissbilanz
import Foundation
import Testing

/// Ports of `src/lib/server/food-package/match.test.ts`: the same packages and
/// stores must lead to the same conflicts and the same writes as on the server.
private func food(
    _ ref: String,
    name: String? = nil,
    brand: String? = nil,
    unit: ServingUnit = .g,
    role: PackageFood.Role = .selected,
    barcode: String? = nil
) -> PackageFood {
    PackageFood(
        ref: ref, role: role, name: name ?? "Food \(ref)", brand: brand, servingSize: 100, servingUnit: unit,
        calories: 100, protein: 1, carbs: 2, fat: 3, fiber: 4, barcode: barcode
    )
}

private func recipe(
    _ ref: String,
    name: String? = nil,
    ingredients: [PackageIngredient] = []
) -> PackageRecipe {
    PackageRecipe(
        ref: ref, name: name ?? "Recipe \(ref)", totalServings: 2, cookedWeight: nil, image: nil,
        ingredients: ingredients
    )
}

private func ingredient(_ ref: String, _ quantity: Double, _ unit: ServingUnit) -> PackageIngredient {
    PackageIngredient(food: ref, quantity: quantity, servingUnit: unit)
}

private func manifest(_ foods: [PackageFood], _ recipes: [PackageRecipe] = []) -> PackageManifest {
    PackageManifest(exportedAt: nil, foods: foods, recipes: recipes)
}

private func existing(
    _ id: String,
    name: String = "Existing",
    brand: String? = nil,
    barcode: String? = nil,
    unit: ServingUnit = .g,
    updatedAt: Double = 1_000,
    entries: Int = 0,
    recipes: Int = 0
) -> ExistingFood {
    ExistingFood(
        id: id, name: name, brand: brand, barcode: barcode, servingUnit: unit,
        updatedAt: updatedAt, entryCount: entries, recipeCount: recipes
    )
}

private func existingRecipe(_ id: String, name: String = "Existing recipe", entries: Int = 0) -> ExistingRecipe {
    ExistingRecipe(id: id, name: name, updatedAt: 1_000, entryCount: entries)
}

private func resolutions(
    _ foods: [(String, FoodPackageAction, String)] = [],
    recipes: [(String, FoodPackageAction, String)] = [],
    mappings: [(String, String)] = []
) -> FoodPackageResolutions {
    FoodPackageResolutions(
        packageHash: String(repeating: "a", count: 64),
        foods: foods.map { FoodPackageResolution(ref: $0.0, action: $0.1, existingId: $0.2) },
        recipes: recipes.map { FoodPackageResolution(ref: $0.0, action: $0.1, existingId: $0.2) },
        mappings: mappings.map { FoodPackageMapping(ref: $0.0, foodId: $0.1) }
    )
}

private func resolveAll(_ match: MatchResult, _ action: FoodPackageAction) -> FoodPackageResolutions {
    resolutions(
        match.foodConflicts.map { ($0.ref, action, $0.existingId) },
        recipes: match.recipeConflicts.map { ($0.ref, action, $0.existingId) }
    )
}

private func kind(_ op: FoodOp?) -> String? {
    switch op {
    case .insert: "insert"
    case .replace: "replace"
    case .skip: "skip"
    case nil: nil
    }
}

private func kind(_ op: RecipeOp?) -> String? {
    switch op {
    case .insert: "insert"
    case .replace: "replace"
    case .skip: "skip"
    case nil: nil
    }
}

@Suite("Food package matching")
struct FoodPackageMatchTests {
    private func match(
        _ manifest: PackageManifest, _ foods: [ExistingFood] = [], _ recipes: [ExistingRecipe] = []
    ) -> MatchResult {
        FoodPackageMatcher.match(manifest: manifest, existingFoods: foods, existingRecipes: recipes)
    }

    @Test("Unmatched foods are new")
    func newFoods() {
        let result = match(manifest([food("f1")]), [existing("e1", name: "Other")])
        #expect(result.newFoodRefs == ["f1"])
        #expect(result.foodConflicts.isEmpty)
    }

    @Test("Name and brand match ignoring case, accents and white space")
    func nameBrand() {
        let target = existing("e1", name: "Müsli  Crunchy", brand: "Migros")
        let result = match(manifest([food("f1", name: "musli crunchy", brand: " MIGROS ")]), [target])
        #expect(result.foodConflicts.count == 1)
        #expect(result.foodConflicts[0].reason == .nameBrand)
        #expect(result.foodConflicts[0].existingId == "e1")
    }

    @Test("The same name with another brand is another food")
    func differentBrand() {
        let result = match(
            manifest([food("f1", name: "Milk", brand: "Coop")]), [existing("e1", name: "Milk", brand: "Migros")]
        )
        #expect(result.newFoodRefs == ["f1"])
    }

    @Test("The barcode match wins when name and barcode hit different foods")
    func barcodeWins() {
        let byName = existing("e1", name: "Oats")
        let byBarcode = existing("e2", name: "Haferflocken", barcode: "7610000000001")
        let result = match(manifest([food("f1", name: "Oats", barcode: "7610000000001")]), [byName, byBarcode])
        let conflict = result.foodConflicts[0]
        #expect(conflict.reason == .barcode)
        #expect(conflict.existingId == "e2")
        #expect(conflict.alsoMatches == ["e1"])
        #expect(conflict.notes.contains(.barcodeDroppedOnKeepBoth))
    }

    @Test("barcode_and_name when both hit the same food")
    func barcodeAndName() {
        let result = match(
            manifest([food("f1", name: "Oats", barcode: "123")]), [existing("e1", name: "Oats", barcode: "123")]
        )
        #expect(result.foodConflicts[0].reason == .barcodeAndName)
    }

    @Test("The most recently updated of several name matches is the target")
    func newestWins() {
        let older = existing("e1", name: "Oats", updatedAt: 1_000)
        let newer = existing("e2", name: "Oats", updatedAt: 9_000)
        let result = match(manifest([food("f1", name: "Oats")]), [older, newer])
        #expect(result.foodConflicts[0].existingId == "e2")
        #expect(result.foodConflicts[0].alsoMatches == ["e1"])
    }

    @Test("A barcode that appears twice in the package is dropped from the second food")
    func duplicateBarcodeInPackage() {
        let result = match(manifest([food("f1", barcode: "42"), food("f2", barcode: " 42 ")]))
        #expect(result.barcodes["f1"] == "42")
        #expect(result.barcodes["f2"] == nil)
        #expect(result.issues.count == 1)
    }

    @Test("Replace is blocked when a unit change would break the user's recipes")
    func replaceUnitBlocked() {
        let target = existing("e1", name: "Milk", unit: .ml, recipes: 2)
        let result = match(manifest([food("f1", name: "Milk", unit: .g)]), [target])
        #expect(result.foodConflicts[0].allowed == [.skip, .keepBoth])
        #expect(result.foodConflicts[0].notes == [.replaceUnitBlocked])
    }

    @Test("Replace warns that it changes history when the food is logged or in recipes")
    func replaceChangesHistory() {
        let logged = match(manifest([food("f1", name: "Milk")]), [existing("e1", name: "Milk", entries: 5)])
        #expect(logged.foodConflicts[0].allowed.contains(.replace))
        #expect(logged.foodConflicts[0].notes == [.replaceChangesHistory])
        let inRecipe = match(manifest([food("f1", name: "Milk")]), [existing("e1", name: "Milk", recipes: 1)])
        #expect(inRecipe.foodConflicts[0].notes == [.replaceChangesHistory])
    }

    @Test("Incoming foods that hit the same existing food form a group")
    func sharedTarget() {
        let target = existing("e1", name: "Oats", barcode: "1")
        let result = match(
            manifest([food("f1", name: "Oats"), food("f2", name: "Other", barcode: "1")]), [target]
        )
        #expect(result.foodConflicts.map(\.targetGroup) == ["e1", "e1"])
        #expect(result.foodConflicts.allSatisfy { $0.notes.contains(.sharedTarget) })
    }

    @Test("Flags a skip that would force a copy for an imported recipe")
    func skipMayCopy() {
        let target = existing("e1", name: "Milk", unit: .g)
        let m = manifest(
            [food("f1", name: "Milk", unit: .ml)],
            [recipe("r1", ingredients: [ingredient("f1", 200, .ml)])]
        )
        #expect(match(m, [target]).foodConflicts[0].notes.contains(.skipMayCopyForRecipe))
    }

    @Test("Recipes with unknown ingredients or incompatible units are left out")
    func invalidRecipes() {
        let m = manifest(
            [food("f1", unit: .g)],
            [
                recipe("r1", ingredients: [ingredient("f9", 1, .g)]),
                recipe("r2", ingredients: [ingredient("f1", 1, .ml)]),
                recipe("r3", ingredients: [ingredient("f1", 1, .kg)]),
            ]
        )
        let result = match(m)
        #expect(result.invalidRecipeRefs == ["r1", "r2"])
        #expect(result.newRecipeRefs == ["r3"])
        #expect(result.issues.count == 2)
    }

    @Test("Recipes match by normalized name")
    func recipeConflicts() {
        let result = match(
            manifest([], [recipe("r1", name: "overnight  oats")]), [], [existingRecipe("x1", name: "Overnight Oats", entries: 3)]
        )
        #expect(result.recipeConflicts.count == 1)
        #expect(result.recipeConflicts[0].existingId == "x1")
        #expect(result.recipeConflicts[0].notes == [.replaceChangesHistory])
    }
}

@Suite("Food package resolution")
struct FoodPackageResolveTests {
    private func resolve(
        _ manifest: PackageManifest,
        _ foods: [ExistingFood],
        _ recipes: [ExistingRecipe] = [],
        _ resolutions: (MatchResult) -> FoodPackageResolutions
    ) throws -> ResolvedOperations {
        let match = FoodPackageMatcher.match(manifest: manifest, existingFoods: foods, existingRecipes: recipes)
        return try FoodPackageMatcher.resolve(
            manifest: manifest, match: match, resolutions: resolutions(match), existingFoods: foods
        )
    }

    @Test("Inserts new foods and applies each conflict's action")
    func appliesActions() throws {
        let a = existing("a", name: "A")
        let b = existing("b", name: "B", barcode: "2")
        let c = existing("c", name: "C")
        let m = manifest([
            food("f1", name: "New"), food("f2", name: "A"),
            food("f3", name: "B", barcode: "2"), food("f4", name: "C"),
        ])
        let ops = try resolve(m, [a, b, c]) { _ in
            resolutions([("f2", .skip, "a"), ("f3", .keepBoth, "b"), ("f4", .replace, "c")])
        }
        #expect(kind(ops.foods["f1"]) == "insert")
        #expect(kind(ops.foods["f2"]) == "skip")
        #expect(kind(ops.foods["f4"]) == "replace")
        // Keep both on a barcode clash stores the copy without the barcode.
        if case let .insert(_, barcode, keptBoth)? = ops.foods["f3"] {
            #expect(barcode == nil)
            #expect(keptBoth)
        } else {
            Issue.record("f3 should be inserted as a copy")
        }
        #expect(ops.foodRefs == ["f1", "f2", "f3", "f4"])
    }

    @Test("Keep both on a name match keeps the barcode")
    func keepBothKeepsBarcode() throws {
        let m = manifest([food("f1", name: "Oats", barcode: "9")])
        let ops = try resolve(m, [existing("e1", name: "Oats")]) { _ in resolutions([("f1", .keepBoth, "e1")]) }
        if case let .insert(_, barcode, keptBoth)? = ops.foods["f1"] {
            #expect(barcode == "9")
            #expect(keptBoth)
        } else {
            Issue.record("f1 should be inserted as a copy")
        }
    }

    @Test("A conflict without a resolution is a stale preview")
    func missingResolution() {
        let m = manifest([food("f1", name: "A")])
        #expect(throws: FoodPackageError.stalePreview) {
            try resolve(m, [existing("a", name: "A")]) { _ in resolutions() }
        }
    }

    @Test("A resolution against another target is a stale preview")
    func changedTarget() {
        let m = manifest([food("f1", name: "A")])
        #expect(throws: FoodPackageError.stalePreview) {
            try resolve(m, [existing("a", name: "A")]) { _ in resolutions([("f1", .skip, "zzz")]) }
        }
    }

    @Test("A resolution for a ref that is not a conflict anymore is a stale preview")
    func staleFoodResolution() throws {
        let m = manifest([food("f1", name: "A")])
        #expect(FoodPackageMatcher.match(manifest: m, existingFoods: [existing("t", name: "A")], existingRecipes: []).foodConflicts.count == 1)
        // The target was deleted since: f1 is new now, and the old choice must not be ignored.
        #expect(throws: FoodPackageError.stalePreview) {
            try resolve(m, []) { _ in resolutions([("f1", .skip, "t")]) }
        }
    }

    @Test("A resolution for a recipe that is not a conflict anymore is a stale preview")
    func staleRecipeResolution() {
        let m = manifest([], [recipe("r1", name: "Porridge")])
        #expect(throws: FoodPackageError.stalePreview) {
            try resolve(m, [], []) { _ in resolutions(recipes: [("r1", .skip, "x")]) }
        }
    }

    @Test("An action that is not allowed is a bad request")
    func disallowedAction() {
        let m = manifest([food("f1", name: "Milk", unit: .g)])
        let target = existing("e1", name: "Milk", unit: .ml, recipes: 1)
        #expect(throws: FoodPackageError.badRequest("\"replace\" is not allowed for f1")) {
            try resolve(m, [target]) { resolveAll($0, .replace) }
        }
    }

    @Test("Only one food may replace a shared target; the rest are skipped")
    func oneReplacePerTarget() throws {
        let target = existing("e1", name: "Oats", barcode: "1")
        let m = manifest([food("f1", name: "Oats"), food("f2", name: "X", barcode: "1")])
        let ops = try resolve(m, [target]) { resolveAll($0, .replace) }
        #expect(kind(ops.foods["f1"]) == "replace")
        #expect(kind(ops.foods["f2"]) == "skip")
        #expect(ops.issues.count == 1)
    }

    @Test("Imports a copy when a skipped food cannot express a recipe quantity")
    func copyWhenUnitDiffers() throws {
        let target = existing("e1", name: "Milk", unit: .g)
        let m = manifest(
            [food("f1", name: "Milk", unit: .ml)],
            [recipe("r1", ingredients: [ingredient("f1", 200, .ml)])]
        )
        let ops = try resolve(m, [target]) { resolveAll($0, .skip) }
        if case let .insert(_, _, keptBoth)? = ops.foods["f1"] {
            #expect(keptBoth)
        } else {
            Issue.record("f1 should be imported as a copy")
        }
        #expect(ops.issues.count == 1)
    }

    @Test("Keeps the skip when the units are compatible")
    func keepsSkip() throws {
        let target = existing("e1", name: "Milk", unit: .ml)
        let m = manifest(
            [food("f1", name: "Milk", unit: .l)],
            [recipe("r1", ingredients: [ingredient("f1", 200, .ml)])]
        )
        let ops = try resolve(m, [target]) { resolveAll($0, .skip) }
        #expect(kind(ops.foods["f1"]) == "skip")
    }

    @Test("Ingredient-only foods whose recipes are not imported are dropped")
    func prunesIngredients() throws {
        let m = manifest(
            [food("f1", role: .ingredient), food("f2", role: .ingredient)],
            [
                recipe("r1", name: "Porridge", ingredients: [ingredient("f1", 50, .g)]),
                recipe("r2", ingredients: [ingredient("f2", 50, .g)]),
            ]
        )
        let ops = try resolve(m, [], [existingRecipe("x1", name: "Porridge")]) { resolveAll($0, .skip) }
        #expect(ops.foods["f1"] == nil)
        #expect(kind(ops.foods["f2"]) == "insert")
        #expect(ops.pruned == 1)
        #expect(kind(ops.recipes["r1"]) == "skip")
        #expect(kind(ops.recipes["r2"]) == "insert")
    }
}

@Suite("Food package mappings")
struct FoodPackageMappingTests {
    private let target = existing("t1", name: "My flour", unit: .g)

    private var m: PackageManifest {
        manifest(
            [
                food("f1", name: "Flour", role: .ingredient),
                food("f2", name: "Sugar", role: .ingredient),
                food("f3", name: "Loose", role: .selected),
            ],
            [recipe("r1", ingredients: [ingredient("f1", 200, .g), ingredient("f2", 50, .g)])]
        )
    }

    private func run(
        _ mappings: [(String, String)],
        foods: [ExistingFood]? = nil,
        manifest: PackageManifest? = nil
    ) throws -> ResolvedOperations {
        let store = foods ?? [target]
        let package = manifest ?? m
        let match = FoodPackageMatcher.match(manifest: package, existingFoods: store, existingRecipes: [])
        return try FoodPackageMatcher.resolve(
            manifest: package, match: match, resolutions: resolutions(mappings: mappings), existingFoods: store
        )
    }

    @Test("Uses the chosen food instead of creating the incoming one")
    func usesChosenFood() throws {
        let ops = try run([("f1", "t1")])
        if case let .skip(_, id)? = ops.foods["f1"] { #expect(id == "t1") } else { Issue.record("f1 should be mapped") }
        #expect(kind(ops.foods["f2"]) == "insert")
        #expect(ops.issues.isEmpty)
    }

    @Test("A selected food can be mapped too")
    func mapsSelected() throws {
        #expect(kind(try run([("f3", "t1")]).foods["f3"]) == "skip")
    }

    @Test("Without mappings everything is created")
    func noMappings() throws {
        let ops = try run([])
        #expect(ops.foodRefs.map { kind(ops.foods[$0]) } == ["insert", "insert", "insert"])
    }

    @Test("Rejects a food the importer does not have")
    func unknownTarget() {
        #expect(throws: FoodPackageError.badRequest("Cannot map f1: the chosen food was not found")) {
            try run([("f1", "stranger")])
        }
    }

    @Test("Rejects an unknown ref and a ref mapped twice")
    func badRefs() {
        #expect(throws: FoodPackageError.badRequest("Cannot map f9: it is not in the package")) {
            try run([("f9", "t1")])
        }
        #expect(throws: FoodPackageError.badRequest("f1 is mapped more than once")) {
            try run([("f1", "t1"), ("f1", "t1")])
        }
    }

    @Test("Rejects mapping a food that conflicts with one the importer has")
    func conflictingFood() {
        let conflicting = existing("c1", name: "Flour")
        let package = manifest([food("f1", name: "Flour")])
        let match = FoodPackageMatcher.match(manifest: package, existingFoods: [conflicting], existingRecipes: [])
        #expect(throws: FoodPackageError.badRequest("Cannot map f1: it matches one of your foods, resolve it instead")) {
            try FoodPackageMatcher.resolve(
                manifest: package, match: match,
                resolutions: resolutions([("f1", .skip, "c1")], mappings: [("f1", "c1")]),
                existingFoods: [conflicting]
            )
        }
    }

    @Test("Reports a stale preview when the mapped food turned into a conflict")
    func turnedIntoConflict() {
        let later = existing("l1", name: "Flour")
        #expect(throws: FoodPackageError.stalePreview) {
            try run([("f1", "t1")], foods: [target, later])
        }
    }

    @Test("Rejects a unit dimension that does not fit a recipe ingredient")
    func dimension() throws {
        let liquid = existing("w1", name: "Water", unit: .ml)
        #expect(throws: FoodPackageError.badRequest("Cannot map f1: \"Water\" uses a unit that does not fit \"Recipe r1\"")) {
            try run([("f1", "w1")], foods: [target, liquid])
        }
        // Nothing constrains a food no recipe uses.
        #expect(kind(try run([("f3", "w1")], foods: [target, liquid]).foods["f3"]) == "skip")
    }

    @Test("Accepts another unit of the same dimension")
    func sameDimension() throws {
        let kilo = existing("k1", name: "Flour kg", unit: .kg)
        #expect(kind(try run([("f1", "k1")], foods: [target, kilo]).foods["f1"]) == "skip")
    }

    @Test("Checks the unit a replaced target will have")
    func replacedUnit() {
        let flour = existing("t1", name: "Flour", unit: .g)
        let package = manifest(
            [food("f1", name: "Flour", unit: .ml), food("f2", name: "Other", role: .ingredient)],
            [recipe("r1", ingredients: [ingredient("f2", 100, .g)])]
        )
        let match = FoodPackageMatcher.match(manifest: package, existingFoods: [flour], existingRecipes: [])
        #expect(throws: FoodPackageError.self) {
            try FoodPackageMatcher.resolve(
                manifest: package, match: match,
                resolutions: resolutions([("f1", .replace, "t1")], mappings: [("f2", "t1")]),
                existingFoods: [flour]
            )
        }
    }

    @Test("A mapped ingredient food whose recipes are not imported is dropped")
    func prunesMapped() throws {
        let other = existingRecipe("x1", name: "Recipe r1")
        let match = FoodPackageMatcher.match(manifest: m, existingFoods: [target], existingRecipes: [other])
        let ops = try FoodPackageMatcher.resolve(
            manifest: m, match: match,
            resolutions: resolutions(recipes: [("r1", .skip, "x1")], mappings: [("f1", "t1")]),
            existingFoods: [target]
        )
        #expect(ops.foods["f1"] == nil)
    }
}
