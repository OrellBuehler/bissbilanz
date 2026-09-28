import Foundation

/// What the matcher needs to know about a food the importer already has.
struct ExistingFood: Equatable {
    let id: String
    let name: String
    let brand: String?
    let barcode: String?
    let servingUnit: ServingUnit
    /// Milliseconds since 1970, 0 when unknown.
    let updatedAt: Double
    let entryCount: Int
    let recipeCount: Int
}

struct ExistingRecipe: Equatable {
    let id: String
    let name: String
    let updatedAt: Double
    let entryCount: Int
}

enum ConflictReason: String {
    case barcode
    case nameBrand = "name_brand"
    case barcodeAndName = "barcode_and_name"
}

enum ConflictNote: String {
    case barcodeDroppedOnKeepBoth = "barcode_dropped_on_keep_both"
    case replaceChangesHistory = "replace_changes_history"
    case replaceUnitBlocked = "replace_unit_blocked"
    case skipMayCopyForRecipe = "skip_may_copy_for_recipe"
    case sharedTarget = "shared_target"
}

struct FoodConflictMatch: Equatable {
    let ref: String
    let reason: ConflictReason
    let existingId: String
    let alsoMatches: [String]
    var allowed: [FoodPackageAction]
    var notes: [ConflictNote]
    /// Set when several incoming foods hit the same existing one: only one may replace it.
    var targetGroup: String?
}

struct RecipeConflictMatch: Equatable {
    let ref: String
    let existingId: String
    let allowed: [FoodPackageAction]
    var notes: [ConflictNote]
}

struct PackageIssue: Equatable {
    let ref: String?
    let message: String
}

struct MatchResult {
    /// Barcode each incoming food would be stored with, after in-package dedupe.
    var barcodes: [String: String] = [:]
    var foodConflicts: [FoodConflictMatch] = []
    var newFoodRefs: [String] = []
    var recipeConflicts: [RecipeConflictMatch] = []
    var newRecipeRefs: [String] = []
    /// Recipes that cannot be rebuilt (unknown ingredient ref, incompatible unit).
    var invalidRecipeRefs: Set<String> = []
    var issues: [PackageIssue] = []
}

enum FoodOp {
    case insert(food: PackageFood, barcode: String?, keptBoth: Bool)
    case replace(food: PackageFood, barcode: String?, id: String)
    case skip(food: PackageFood, id: String)
}

enum RecipeOp {
    case insert(recipe: PackageRecipe, keptBoth: Bool)
    case replace(recipe: PackageRecipe, id: String)
    case skip(recipe: PackageRecipe, id: String)
}

struct ResolvedOperations {
    var foodRefs: [String] = []
    var foods: [String: FoodOp] = [:]
    var recipeRefs: [String] = []
    var recipes: [String: RecipeOp] = [:]
    /// Ingredient-only foods left out because none of their recipes is imported.
    var pruned = 0
    var issues: [PackageIssue] = []

    fileprivate mutating func setFood(_ ref: String, _ op: FoodOp) {
        if foods.updateValue(op, forKey: ref) == nil { foodRefs.append(ref) }
    }

    fileprivate mutating func setRecipe(_ ref: String, _ op: RecipeOp) {
        if recipes.updateValue(op, forKey: ref) == nil { recipeRefs.append(ref) }
    }

    fileprivate mutating func removeFood(_ ref: String) {
        if foods.removeValue(forKey: ref) != nil { foodRefs.removeAll { $0 == ref } }
    }

    var orderedFoods: [(ref: String, op: FoodOp)] {
        foodRefs.compactMap { ref in foods[ref].map { (ref, $0) } }
    }

    var orderedRecipes: [(ref: String, op: RecipeOp)] {
        recipeRefs.compactMap { ref in recipes[ref].map { (ref, $0) } }
    }
}

/// Port of `src/lib/server/food-package/match.ts`. Pure: every decision the
/// preview shows (and the import later re-derives) comes from here.
enum FoodPackageMatcher {
    private static let allActions: [FoodPackageAction] = [.skip, .replace, .keepBoth]

    private static func newest<T>(
        _ rows: [T], updatedAt: (T) -> Double, id: (T) -> String
    ) -> [T] {
        rows.sorted { lhs, rhs in
            if updatedAt(lhs) != updatedAt(rhs) { return updatedAt(lhs) > updatedAt(rhs) }
            return id(lhs) < id(rhs)
        }
    }

    private static func newestFoods(_ rows: [ExistingFood]) -> [ExistingFood] {
        newest(rows, updatedAt: \.updatedAt, id: \.id)
    }

    private static func group<T>(_ rows: [T], by key: (T) -> String?) -> [String: [T]] {
        var map: [String: [T]] = [:]
        for row in rows {
            guard let value = key(row) else { continue }
            map[value, default: []].append(row)
        }
        return map
    }

    /// A food conflicts when its barcode OR its name + brand matches an existing
    /// food. Barcode is the stronger identity: when the name matches one food and
    /// the barcode another, the barcode match is the one acted on.
    static func match(
        manifest: PackageManifest,
        existingFoods: [ExistingFood],
        existingRecipes: [ExistingRecipe]
    ) -> MatchResult {
        var result = MatchResult()
        let foodsByRef = Dictionary(manifest.foods.map { ($0.ref, $0) }, uniquingKeysWith: { first, _ in first })

        for recipe in manifest.recipes {
            for ingredient in recipe.ingredients {
                guard let food = foodsByRef[ingredient.food] else {
                    result.invalidRecipeRefs.insert(recipe.ref)
                    result.issues.append(PackageIssue(
                        ref: recipe.ref, message: "\"\(recipe.name)\": an ingredient is missing"
                    ))
                    break
                }
                if !isSameUnitDimension(ingredient.servingUnit, food.servingUnit) {
                    result.invalidRecipeRefs.insert(recipe.ref)
                    result.issues.append(PackageIssue(
                        ref: recipe.ref,
                        message: "\"\(recipe.name)\": ingredient \"\(food.name)\" uses an incompatible unit"
                    ))
                    break
                }
            }
        }

        let byBarcode = group(existingFoods) { FoodPackageText.trimBarcode($0.barcode) }
        let byName = group(existingFoods) { FoodPackageText.foodKey(name: $0.name, brand: $0.brand) }
        let existingById = Dictionary(existingFoods.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        var seenBarcodes = Set<String>()
        for food in manifest.foods {
            var barcode = FoodPackageText.trimBarcode(food.barcode)
            if let value = barcode, seenBarcodes.contains(value) {
                result.issues.append(PackageIssue(
                    ref: food.ref,
                    message: "\"\(food.name)\": barcode \(value) appears twice in the package and was removed"
                ))
                barcode = nil
            }
            if let barcode { seenBarcodes.insert(barcode) }
            result.barcodes[food.ref] = barcode

            let barcodeMatch = barcode.flatMap { newestFoods(byBarcode[$0] ?? []).first }
            let nameMatches = newestFoods(byName[FoodPackageText.foodKey(name: food.name, brand: food.brand)] ?? [])
            guard let primary = barcodeMatch ?? nameMatches.first else {
                result.newFoodRefs.append(food.ref)
                continue
            }

            let nameHitsPrimary = nameMatches.contains { $0.id == primary.id }
            let reason: ConflictReason = if barcodeMatch != nil {
                nameHitsPrimary ? .barcodeAndName : .barcode
            } else {
                .nameBrand
            }
            let alsoMatches = nameMatches.filter { $0.id != primary.id }.map(\.id)

            var notes: [ConflictNote] = []
            var allowed = allActions
            if primary.recipeCount > 0, !isSameUnitDimension(primary.servingUnit, food.servingUnit) {
                allowed.removeAll { $0 == .replace }
                notes.append(.replaceUnitBlocked)
            } else if primary.entryCount > 0 || primary.recipeCount > 0 {
                notes.append(.replaceChangesHistory)
            }
            if reason != .nameBrand { notes.append(.barcodeDroppedOnKeepBoth) }

            result.foodConflicts.append(FoodConflictMatch(
                ref: food.ref,
                reason: reason,
                existingId: primary.id,
                alsoMatches: alsoMatches,
                allowed: allowed,
                notes: notes,
                targetGroup: nil
            ))
        }

        var targetCounts: [String: Int] = [:]
        for conflict in result.foodConflicts { targetCounts[conflict.existingId, default: 0] += 1 }
        for index in result.foodConflicts.indices {
            let target = result.foodConflicts[index].existingId
            if (targetCounts[target] ?? 0) >= 2 {
                result.foodConflicts[index].targetGroup = target
                result.foodConflicts[index].notes.append(.sharedTarget)
            }
        }

        // Skipping a food maps the package's recipes onto the existing one, which
        // only works if the recipe's quantities are in the same dimension.
        var conflictIndex: [String: Int] = [:]
        for (index, conflict) in result.foodConflicts.enumerated() where conflictIndex[conflict.ref] == nil {
            conflictIndex[conflict.ref] = index
        }
        for recipe in manifest.recipes where !result.invalidRecipeRefs.contains(recipe.ref) {
            for ingredient in recipe.ingredients {
                guard let index = conflictIndex[ingredient.food],
                      let existing = existingById[result.foodConflicts[index].existingId] else { continue }
                if !isSameUnitDimension(ingredient.servingUnit, existing.servingUnit),
                   !result.foodConflicts[index].notes.contains(.skipMayCopyForRecipe)
                {
                    result.foodConflicts[index].notes.append(.skipMayCopyForRecipe)
                }
            }
        }

        let recipesByName = group(existingRecipes) { FoodPackageText.recipeKey($0.name) }
        for recipe in manifest.recipes where !result.invalidRecipeRefs.contains(recipe.ref) {
            let matches = newest(
                recipesByName[FoodPackageText.recipeKey(recipe.name)] ?? [], updatedAt: \.updatedAt, id: \.id
            )
            guard let existing = matches.first else {
                result.newRecipeRefs.append(recipe.ref)
                continue
            }
            result.recipeConflicts.append(RecipeConflictMatch(
                ref: recipe.ref,
                existingId: existing.id,
                allowed: allActions,
                notes: existing.entryCount > 0 ? [.replaceChangesHistory] : []
            ))
        }
        var recipeTargets: [String: Int] = [:]
        for conflict in result.recipeConflicts { recipeTargets[conflict.existingId, default: 0] += 1 }
        for index in result.recipeConflicts.indices
            where (recipeTargets[result.recipeConflicts[index].existingId] ?? 0) >= 2
        {
            result.recipeConflicts[index].notes.append(.sharedTarget)
        }
        return result
    }

    /// Applies the user's choices to a match result, producing the concrete writes.
    /// Throws `stalePreview` if a conflict has no (or an outdated) resolution.
    static func resolve(
        manifest: PackageManifest,
        match: MatchResult,
        resolutions: FoodPackageResolutions,
        existingFoods: [ExistingFood]
    ) throws -> ResolvedOperations {
        var operations = ResolvedOperations()
        let foodsByRef = Dictionary(manifest.foods.map { ($0.ref, $0) }, uniquingKeysWith: { first, _ in first })
        let existingById = Dictionary(existingFoods.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let foodResolutions = Dictionary(resolutions.foods.map { ($0.ref, $0) }, uniquingKeysWith: { _, last in last })
        let recipeResolutions = Dictionary(
            resolutions.recipes.map { ($0.ref, $0) }, uniquingKeysWith: { _, last in last }
        )

        for ref in match.newFoodRefs {
            guard let food = foodsByRef[ref] else { continue }
            operations.setFood(ref, .insert(food: food, barcode: match.barcodes[ref], keptBoth: false))
        }

        var conflictReason: [String: ConflictReason] = [:]
        var replacedTargets = Set<String>()
        var unitAfterReplace: [String: ServingUnit] = [:]
        var resolvedFoodRefs = Set<String>()
        for conflict in match.foodConflicts {
            guard let food = foodsByRef[conflict.ref] else { continue }
            conflictReason[conflict.ref] = conflict.reason
            var action = try take(foodResolutions, ref: conflict.ref, existingId: conflict.existingId, allowed: conflict.allowed)
            resolvedFoodRefs.insert(conflict.ref)
            if action == .replace, replacedTargets.contains(conflict.existingId) {
                operations.issues.append(PackageIssue(
                    ref: conflict.ref,
                    message: "\"\(food.name)\": another food in the package already replaces the same food — skipped"
                ))
                action = .skip
            }
            let barcode = match.barcodes[conflict.ref]
            switch action {
            case .replace:
                replacedTargets.insert(conflict.existingId)
                unitAfterReplace[conflict.existingId] = food.servingUnit
                operations.setFood(conflict.ref, .replace(food: food, barcode: barcode, id: conflict.existingId))
            case .keepBoth:
                operations.setFood(conflict.ref, .insert(
                    food: food, barcode: conflict.reason == .nameBrand ? barcode : nil, keptBoth: true
                ))
            case .skip:
                operations.setFood(conflict.ref, .skip(food: food, id: conflict.existingId))
            }
        }
        // A resolution for a ref that is not a conflict anymore (the food it was
        // resolved against was deleted, so the ref is now "new") is stale.
        guard resolvedFoodRefs.count == foodResolutions.count else { throw FoodPackageError.stalePreview }

        // Mappings: a new incoming food is left out and the importer's own food
        // stands in for it. Checked after conflicts, so a food that turned into a
        // conflict since the preview reports a stale preview rather than a bad request.
        let newRefs = Set(match.newFoodRefs)
        var mapped = Set<String>()
        for mapping in resolutions.mappings {
            guard let food = foodsByRef[mapping.ref] else {
                throw FoodPackageError.badRequest("Cannot map \(mapping.ref): it is not in the package")
            }
            guard newRefs.contains(mapping.ref) else {
                throw FoodPackageError.badRequest(
                    "Cannot map \(mapping.ref): it matches one of your foods, resolve it instead"
                )
            }
            guard mapped.insert(mapping.ref).inserted else {
                throw FoodPackageError.badRequest("\(mapping.ref) is mapped more than once")
            }
            guard let target = existingById[mapping.foodId] else {
                throw FoodPackageError.badRequest("Cannot map \(mapping.ref): the chosen food was not found")
            }
            let targetUnit = unitAfterReplace[target.id] ?? target.servingUnit
            for recipe in manifest.recipes where !match.invalidRecipeRefs.contains(recipe.ref) {
                for ingredient in recipe.ingredients
                    where ingredient.food == mapping.ref && !isSameUnitDimension(ingredient.servingUnit, targetUnit)
                {
                    throw FoodPackageError.badRequest(
                        "Cannot map \(mapping.ref): \"\(target.name)\" uses a unit that does not fit \"\(recipe.name)\""
                    )
                }
            }
            operations.setFood(mapping.ref, .skip(food: food, id: target.id))
        }

        let recipesByRef = Dictionary(manifest.recipes.map { ($0.ref, $0) }, uniquingKeysWith: { first, _ in first })
        for ref in match.newRecipeRefs {
            guard let recipe = recipesByRef[ref] else { continue }
            operations.setRecipe(ref, .insert(recipe: recipe, keptBoth: false))
        }
        var replacedRecipes = Set<String>()
        var resolvedRecipeRefs = Set<String>()
        for conflict in match.recipeConflicts {
            guard let recipe = recipesByRef[conflict.ref] else { continue }
            var action = try take(
                recipeResolutions, ref: conflict.ref, existingId: conflict.existingId, allowed: conflict.allowed
            )
            resolvedRecipeRefs.insert(conflict.ref)
            if action == .replace, replacedRecipes.contains(conflict.existingId) {
                operations.issues.append(PackageIssue(
                    ref: conflict.ref,
                    message: "\"\(recipe.name)\": another recipe in the package already replaces the same recipe — skipped"
                ))
                action = .skip
            }
            switch action {
            case .replace:
                replacedRecipes.insert(conflict.existingId)
                operations.setRecipe(conflict.ref, .replace(recipe: recipe, id: conflict.existingId))
            case .keepBoth:
                operations.setRecipe(conflict.ref, .insert(recipe: recipe, keptBoth: true))
            case .skip:
                operations.setRecipe(conflict.ref, .skip(recipe: recipe, id: conflict.existingId))
            }
        }
        guard resolvedRecipeRefs.count == recipeResolutions.count else { throw FoodPackageError.stalePreview }

        // A skipped food stands in for the incoming one inside imported recipes; if
        // its unit can't express the recipe's quantity, import a copy instead.
        var referenced = Set<String>()
        for (_, op) in operations.orderedRecipes {
            let recipe: PackageRecipe
            switch op {
            case .skip: continue
            case let .insert(inserted, _): recipe = inserted
            case let .replace(replaced, _): recipe = replaced
            }
            for ingredient in recipe.ingredients {
                referenced.insert(ingredient.food)
                guard case let .skip(skippedFood, id)? = operations.foods[ingredient.food],
                      !mapped.contains(ingredient.food) else { continue }
                if let existing = existingById[id], isSameUnitDimension(ingredient.servingUnit, existing.servingUnit) {
                    continue
                }
                operations.issues.append(PackageIssue(
                    ref: skippedFood.ref,
                    message: "\"\(skippedFood.name)\": your existing food uses a different unit, so a copy was imported for \"\(recipe.name)\""
                ))
                let barcode = match.barcodes[skippedFood.ref]
                operations.setFood(skippedFood.ref, .insert(
                    food: skippedFood,
                    barcode: conflictReason[skippedFood.ref] == .nameBrand ? barcode : nil,
                    keptBoth: true
                ))
            }
        }

        // Foods that only came along as ingredients are dropped with their recipes.
        for ref in match.newFoodRefs {
            guard let food = foodsByRef[ref], food.role == .ingredient, !referenced.contains(ref) else { continue }
            operations.removeFood(ref)
            operations.pruned += 1
        }
        return operations
    }

    private static func take(
        _ resolutions: [String: FoodPackageResolution],
        ref: String,
        existingId: String,
        allowed: [FoodPackageAction]
    ) throws -> FoodPackageAction {
        guard let resolution = resolutions[ref], resolution.existingId == existingId else {
            throw FoodPackageError.stalePreview
        }
        guard allowed.contains(resolution.action) else {
            throw FoodPackageError.badRequest("\"\(resolution.action.rawValue)\" is not allowed for \(ref)")
        }
        return resolution.action
    }
}
