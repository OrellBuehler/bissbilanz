import Foundation

/// One mergeable field across every food in the merge: what each food holds,
/// what the merged keeper ends up with, and which food that value comes from.
struct FoodMergeFieldDiff: Identifiable {
    let key: String
    let values: [String: FoodMergeValue]
    let result: FoodMergeValue
    /// The food whose value wins — the keeper unless it was empty and a source
    /// backfilled it, or the user picked another food's value.
    let resultFoodId: String
    let isOverridden: Bool
    /// Foods whose per-serving value in `values` was rescaled to the merged
    /// food's serving.
    var scaledFoodIds: Set<String> = []

    var id: String { key }

    var differs: Bool {
        Set(values.values).count > 1
    }
}

/// What `POST /api/foods/merge` should be sent to produce the previewed food.
struct FoodMergeSubmission: Equatable {
    let keeperId: String
    let sourceIds: [String]
    let overrides: [String: FoodMergeValue]
}

/// How the foods' servings relate, for the explanatory header.
enum FoodMergeServingNote: Equatable {
    /// Every food has the same serving.
    case same
    /// Servings differ in amount only, so nutrients rescale exactly.
    case sameUnit
    /// Units differ but convert (g/kg, ml/l), so nutrients still rescale.
    case convertibleUnits
    /// Some food's unit can't convert to the kept serving (g vs. piece).
    case incompatibleUnits
}

/// Client-side preview of `POST /api/foods/merge`, mirroring
/// `computeMergedFood` + `applyOverrides` in `src/lib/server/food-merge.ts`:
/// the keeper's value wins, an empty keeper field is filled from the first
/// source that has one, `isFavorite` is OR-ed, and overrides beat both.
///
/// Serving size and unit are picked together, and per-serving nutrients are
/// rescaled to the chosen serving when the units convert. The server keeps
/// diary entries' logged amount by rescaling `servings` from each source's
/// serving size to the *keeper's* original one, so a serving taken from
/// another food is sent as a merge with that food as the server-side keeper
/// (`submission`); every other choice then travels as an override.
enum FoodMergePlan {
    /// `MERGEABLE_FIELDS` on the server, in display order.
    static let fieldKeys: [String] =
        ["name", "brand", "servingSize", "servingUnit", "calories", "protein", "carbs", "fat", "fiber"]
            + NutrientCatalog.all.map(\.key)
            + ["barcode", "isFavorite", "nutriScore", "novaGroup", "additives", "ingredientsText", "imageUrl"]

    /// What the simple summary shows: what a food *is* for tracking purposes.
    static let keyFieldKeys: Set<String> =
        ["servingSize", "servingUnit", "calories", "protein", "carbs", "fat", "fiber", "barcode"]

    /// Per-serving amounts: comparable between foods once rescaled to one serving.
    static let nutrientKeys: Set<String> =
        Set(["calories", "protein", "carbs", "fat", "fiber"] + NutrientCatalog.all.map(\.key))

    /// The serving is one choice: amount and unit always come from the same food.
    static let servingKeys: Set<String> = ["servingSize", "servingUnit"]

    /// The food whose serving the merged food gets: the one picked for either
    /// serving field, else the keeper.
    static func servingFoodId(foods: [Food], keeperId: String, overrides: [String: String]) -> String {
        let picked = overrides["servingSize"] ?? overrides["servingUnit"]
        if let picked, foods.contains(where: { $0.id == picked }) { return picked }
        return keeperId
    }

    /// Multiplier that turns a per-serving amount of `food` into the same
    /// amount per `target` serving, or nil when the units don't convert
    /// (mass with volume, or an empty serving).
    static func scaleFactor(from food: Food, to target: Food) -> Double? {
        if food.servingUnit == target.servingUnit, food.servingSize == target.servingSize { return 1 }
        guard food.servingUnit.isVolume == target.servingUnit.isVolume else { return nil }
        let source = food.servingSize * food.servingUnit.baseUnitsPerUnit
        guard source > 0 else { return nil }
        return target.servingSize * target.servingUnit.baseUnitsPerUnit / source
    }

    static func servingNote(foods: [Food], servingFoodId: String) -> FoodMergeServingNote {
        guard let servingFood = foods.first(where: { $0.id == servingFoodId }) else { return .same }
        var note = FoodMergeServingNote.same
        for food in foods {
            if scaleFactor(from: food, to: servingFood) == nil { return .incompatibleUnits }
            if food.servingUnit != servingFood.servingUnit {
                note = .convertibleUnits
            } else if food.servingSize != servingFood.servingSize, note == .same {
                note = .sameUnit
            }
        }
        return note
    }

    /// Whether the user may take `key` from `foodId` instead of the automatic
    /// result. A serving can be taken from any food. A per-serving nutrient
    /// can be taken from a food whose serving converts to the chosen one; it
    /// is rescaled to it. Nutrients of a food with an incompatible unit stay
    /// locked, or they would describe a different amount.
    static func canPick(
        key: String,
        from foodId: String,
        foods: [Food],
        keeperId: String,
        overrides: [String: String] = [:]
    ) -> Bool {
        guard foods.contains(where: { $0.id == foodId }) else { return false }
        guard nutrientKeys.contains(key) else { return true }
        let servingId = servingFoodId(foods: foods, keeperId: keeperId, overrides: overrides)
        guard let servingFood = foods.first(where: { $0.id == servingId }),
              let food = foods.first(where: { $0.id == foodId })
        else { return false }
        return scaleFactor(from: food, to: servingFood) != nil
    }

    private static func rescaled(_ value: Double, by factor: Double) -> Double {
        (value * factor * 1000).rounded() / 1000
    }

    /// The server's own outcome with `keeperId` as keeper and no overrides.
    private static func serverResults(
        foods: [Food],
        dictionaries: [(String, [String: Any])],
        keeperId: String
    ) -> [String: FoodMergeValue] {
        let sourceIds = foods.map(\.id).filter { $0 != keeperId }
        var results: [String: FoodMergeValue] = [:]
        for key in fieldKeys {
            let isFlag = key == "isFavorite"
            var values: [String: FoodMergeValue] = [:]
            for (id, dictionary) in dictionaries {
                values[id] = FoodMergeValue(json: dictionary[key], isFlag: isFlag)
            }
            var result = values[keeperId] ?? .empty
            for sourceId in sourceIds {
                let source = values[sourceId] ?? .empty
                if isFlag {
                    if source == .flag(true), result != .flag(true) { result = source }
                } else if result.isEmpty, !source.isEmpty {
                    result = source
                }
            }
            results[key] = result
        }
        return results
    }

    static func diffs(
        foods: [Food],
        keeperId: String,
        overrides: [String: String] = [:]
    ) -> [FoodMergeFieldDiff] {
        let dictionaries = foods.map { food in
            (food.id, (try? JSONPatch.dictionary(of: food)) ?? [:])
        }
        let servingId = servingFoodId(foods: foods, keeperId: keeperId, overrides: overrides)

        var factors: [String: Double] = [:]
        if let servingFood = foods.first(where: { $0.id == servingId }) {
            for food in foods {
                if let factor = scaleFactor(from: food, to: servingFood) { factors[food.id] = factor }
            }
        }
        // The keeper's nutrients describe the chosen serving unless its unit
        // can't convert to it; then they come from the food that has that serving.
        let nutrientPrimaryId = factors[keeperId] != nil ? keeperId : servingId

        return fieldKeys.map { key in
            let isFlag = key == "isFavorite"
            let isNutrient = nutrientKeys.contains(key)
            let isServing = servingKeys.contains(key)

            var values: [String: FoodMergeValue] = [:]
            var scaledFoodIds: Set<String> = []
            for (id, dictionary) in dictionaries {
                var value = FoodMergeValue(json: dictionary[key], isFlag: isFlag)
                if isNutrient, case let .number(number) = value, let factor = factors[id], factor != 1 {
                    value = .number(rescaled(number, by: factor))
                    scaledFoodIds.insert(id)
                }
                values[id] = value
            }

            let primaryId = isServing ? servingId : (isNutrient ? nutrientPrimaryId : keeperId)
            var result = values[primaryId] ?? .empty
            var resultFoodId = primaryId
            if !isServing {
                let backfillIds = foods.map(\.id).filter {
                    $0 != primaryId && (!isNutrient || factors[$0] != nil)
                }
                for sourceId in backfillIds {
                    let source = values[sourceId] ?? .empty
                    if isFlag {
                        if source == .flag(true), result != .flag(true) {
                            result = source
                            resultFoodId = sourceId
                        }
                    } else if result.isEmpty, !source.isEmpty {
                        result = source
                        resultFoodId = sourceId
                    }
                }
            }

            var isOverridden = isServing && servingId != keeperId
            if !isServing, let pickedId = overrides[key], let picked = values[pickedId], !picked.isEmpty,
               canPick(key: key, from: pickedId, foods: foods, keeperId: keeperId, overrides: overrides)
            {
                result = picked
                resultFoodId = pickedId
                isOverridden = true
            }

            return FoodMergeFieldDiff(
                key: key,
                values: values,
                result: result,
                resultFoodId: resultFoodId,
                isOverridden: isOverridden,
                scaledFoodIds: scaledFoodIds
            )
        }
    }

    /// The merge request that yields the previewed food: the food whose
    /// serving is kept is the server-side keeper, and every field where the
    /// preview differs from the server's own outcome for it goes in
    /// `overrides`, so an untouched preview sends none.
    static func submission(
        foods: [Food],
        keeperId: String,
        overrides: [String: String]
    ) -> FoodMergeSubmission {
        let serverKeeperId = servingFoodId(foods: foods, keeperId: keeperId, overrides: overrides)
        let dictionaries = foods.map { food in
            (food.id, (try? JSONPatch.dictionary(of: food)) ?? [:])
        }
        let automatic = serverResults(foods: foods, dictionaries: dictionaries, keeperId: serverKeeperId)
        var body: [String: FoodMergeValue] = [:]
        for diff in diffs(foods: foods, keeperId: keeperId, overrides: overrides)
            where diff.result != automatic[diff.key]
        {
            body[diff.key] = diff.result
        }
        return FoodMergeSubmission(
            keeperId: serverKeeperId,
            sourceIds: foods.map(\.id).filter { $0 != serverKeeperId },
            overrides: body
        )
    }
}
