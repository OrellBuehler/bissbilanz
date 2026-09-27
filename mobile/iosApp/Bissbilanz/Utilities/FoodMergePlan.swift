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

    var id: String { key }

    var differs: Bool {
        Set(values.values).count > 1
    }
}

/// Client-side preview of `POST /api/foods/merge`, mirroring
/// `computeMergedFood` + `applyOverrides` in `src/lib/server/food-merge.ts`:
/// the keeper's value wins, an empty keeper field is filled from the first
/// source that has one, `isFavorite` is OR-ed, and overrides beat both.
enum FoodMergePlan {
    /// `MERGEABLE_FIELDS` on the server, in display order.
    static let fieldKeys: [String] =
        ["name", "brand", "servingSize", "servingUnit", "calories", "protein", "carbs", "fat", "fiber"]
            + NutrientCatalog.all.map(\.key)
            + ["barcode", "isFavorite", "nutriScore", "novaGroup", "additives", "ingredientsText", "imageUrl"]

    /// What the simple summary shows: what a food *is* for tracking purposes.
    static let keyFieldKeys: Set<String> =
        ["servingSize", "servingUnit", "calories", "protein", "carbs", "fat", "fiber", "barcode"]

    /// Per-serving amounts: only comparable between foods with the same serving.
    static let nutrientKeys: Set<String> =
        Set(["calories", "protein", "carbs", "fat", "fiber"] + NutrientCatalog.all.map(\.key))

    /// Whether the user may take `key` from `foodId` instead of the automatic
    /// result. The serving itself stays the keeper's — the server rescales
    /// merged diary entries against the keeper's original serving size — and
    /// a per-serving nutrient can only be borrowed from a food with the same
    /// serving, or it would describe a different amount.
    static func canPick(key: String, from foodId: String, foods: [Food], keeperId: String) -> Bool {
        if key == "servingSize" || key == "servingUnit" { return false }
        guard nutrientKeys.contains(key) else { return true }
        guard let keeper = foods.first(where: { $0.id == keeperId }),
              let food = foods.first(where: { $0.id == foodId })
        else { return false }
        return keeper.servingSize == food.servingSize && keeper.servingUnit == food.servingUnit
    }

    static func diffs(
        foods: [Food],
        keeperId: String,
        overrides: [String: String] = [:]
    ) -> [FoodMergeFieldDiff] {
        let dictionaries = foods.map { food in
            (food.id, (try? JSONPatch.dictionary(of: food)) ?? [:])
        }
        let sourceIds = foods.map(\.id).filter { $0 != keeperId }

        return fieldKeys.map { key in
            let isFlag = key == "isFavorite"
            var values: [String: FoodMergeValue] = [:]
            for (id, dictionary) in dictionaries {
                values[id] = FoodMergeValue(json: dictionary[key], isFlag: isFlag)
            }

            var result = values[keeperId] ?? .empty
            var resultFoodId = keeperId
            for sourceId in sourceIds {
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

            var isOverridden = false
            if let pickedId = overrides[key], let picked = values[pickedId], !picked.isEmpty,
               canPick(key: key, from: pickedId, foods: foods, keeperId: keeperId)
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
                isOverridden: isOverridden
            )
        }
    }

    /// The `overrides` body for the merge request: only picks that change the
    /// outcome, so an untouched preview sends none.
    static func overrideValues(
        foods: [Food],
        keeperId: String,
        overrides: [String: String]
    ) -> [String: FoodMergeValue] {
        let automatic = Dictionary(uniqueKeysWithValues: diffs(foods: foods, keeperId: keeperId).map { ($0.key, $0.result) })
        var body: [String: FoodMergeValue] = [:]
        for diff in diffs(foods: foods, keeperId: keeperId, overrides: overrides) where diff.isOverridden {
            if diff.result != automatic[diff.key] {
                body[diff.key] = diff.result
            }
        }
        return body
    }
}
