package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageConflictNote
import com.bissbilanz.api.generated.model.FoodPackageConflictReason
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import com.bissbilanz.util.isSameUnitDimension

/** What the matcher needs to know about a food the importer already has. */
data class ExistingFood(
    val id: String,
    val name: String,
    val brand: String?,
    val barcode: String?,
    val servingUnit: String,
    val isSupplement: Boolean,
    val updatedAtMillis: Long,
    val entryCount: Int,
    val recipeCount: Int,
)

data class ExistingRecipe(
    val id: String,
    val name: String,
    val updatedAtMillis: Long,
    val entryCount: Int,
)

data class FoodConflictMatch(
    val ref: String,
    val reason: FoodPackageConflictReason,
    val existingId: String,
    val alsoMatches: List<String>,
    val allowed: List<FoodPackageAction>,
    val notes: MutableList<FoodPackageConflictNote>,
    /** Set when several incoming foods hit the same existing one: only one may replace it. */
    var targetGroup: String?,
)

data class RecipeConflictMatch(
    val ref: String,
    val existingId: String,
    val allowed: List<FoodPackageAction>,
    val notes: MutableList<FoodPackageConflictNote>,
)

data class PackageIssueNote(
    val ref: String?,
    val message: String,
)

data class MatchResult(
    /** Barcode each incoming food would be stored with, after in-package dedupe. */
    val barcodes: Map<String, String?>,
    val foodConflicts: List<FoodConflictMatch>,
    val newFoodRefs: List<String>,
    val recipeConflicts: List<RecipeConflictMatch>,
    val newRecipeRefs: List<String>,
    /** Recipes that cannot be rebuilt (unknown ingredient ref, incompatible unit). */
    val invalidRecipeRefs: Set<String>,
    val issues: List<PackageIssueNote>,
)

private data class Stamped(
    val id: String,
    val updatedAtMillis: Long,
)

private fun <T> newest(
    rows: List<T>,
    stamp: (T) -> Stamped,
): List<T> =
    rows.sortedWith(
        compareByDescending<T> { stamp(it).updatedAtMillis }.thenBy { stamp(it).id },
    )

private fun <T> groupByKey(
    rows: List<T>,
    key: (T) -> String?,
): Map<String, List<T>> {
    val map = LinkedHashMap<String, MutableList<T>>()
    for (row in rows) {
        val value = key(row) ?: continue
        map.getOrPut(value) { mutableListOf() }.add(row)
    }
    return map
}

private val ALL_ACTIONS = listOf(FoodPackageAction.skip, FoodPackageAction.replace, FoodPackageAction.keep_both)

/**
 * Compare a package against the importer's database. Pure: every decision the preview shows
 * (and the commit later re-derives) comes from here. A port of `matchPackage` in
 * `src/lib/server/food-package/match.ts`.
 *
 * A food conflicts when its barcode OR its name + brand matches an existing food. Barcode is
 * the stronger identity: when the name matches one food and the barcode another, the barcode
 * match is the one acted on.
 */
fun matchPackage(
    manifest: PackageManifest,
    existingFoods: List<ExistingFood>,
    existingRecipes: List<ExistingRecipe>,
): MatchResult {
    val issues = mutableListOf<PackageIssueNote>()
    val foodsByRef = manifest.foods.associateBy { it.ref }

    // Recipes that cannot be rebuilt are reported and left out entirely.
    val invalidRecipeRefs = LinkedHashSet<String>()
    for (recipe in manifest.recipes) {
        for (ingredient in recipe.ingredients) {
            val food = foodsByRef[ingredient.food]
            if (food == null) {
                invalidRecipeRefs.add(recipe.ref)
                issues.add(PackageIssueNote(recipe.ref, "\"${recipe.name}\": an ingredient is missing"))
                break
            }
            if (!isSameUnitDimension(ingredient.servingUnit, food.servingUnit)) {
                invalidRecipeRefs.add(recipe.ref)
                issues.add(
                    PackageIssueNote(recipe.ref, "\"${recipe.name}\": ingredient \"${food.name}\" uses an incompatible unit"),
                )
                break
            }
        }
    }

    val stamp = { food: ExistingFood -> Stamped(food.id, food.updatedAtMillis) }
    val candidates = existingFoods.filter { !it.isSupplement }
    val byBarcode = groupByKey(existingFoods) { trimBarcode(it.barcode) }
    val byName = groupByKey(candidates) { foodKey(it.name, it.brand) }
    val existingById = existingFoods.associateBy { it.id }

    val barcodes = LinkedHashMap<String, String?>()
    val seenBarcodes = HashSet<String>()
    val foodConflicts = mutableListOf<FoodConflictMatch>()
    val newFoodRefs = mutableListOf<String>()

    for (food in manifest.foods) {
        var barcode = trimBarcode(food.barcode)
        if (barcode != null && barcode in seenBarcodes) {
            issues.add(
                PackageIssueNote(food.ref, "\"${food.name}\": barcode $barcode appears twice in the package and was removed"),
            )
            barcode = null
        }
        if (barcode != null) seenBarcodes.add(barcode)

        var barcodeMatch = barcode?.let { newest(byBarcode[it] ?: emptyList(), stamp).firstOrNull() }
        if (barcodeMatch != null && barcodeMatch.isSupplement) {
            // Supplements never conflict; the barcode just cannot be taken twice.
            issues.add(
                PackageIssueNote(
                    food.ref,
                    "\"${food.name}\": barcode $barcode is used by one of your supplements and was removed",
                ),
            )
            barcode = null
            barcodeMatch = null
        }
        barcodes[food.ref] = barcode

        val nameMatches = newest(byName[foodKey(food.name, food.brand)] ?: emptyList(), stamp)
        val primary = barcodeMatch ?: nameMatches.firstOrNull()
        if (primary == null) {
            newFoodRefs.add(food.ref)
            continue
        }

        val nameHitsPrimary = nameMatches.any { it.id == primary.id }
        val reason =
            if (barcodeMatch != null) {
                if (nameHitsPrimary) FoodPackageConflictReason.barcode_and_name else FoodPackageConflictReason.barcode
            } else {
                FoodPackageConflictReason.name_brand
            }
        val alsoMatches = nameMatches.filter { it.id != primary.id }.map { it.id }

        val notes = mutableListOf<FoodPackageConflictNote>()
        val allowed = ALL_ACTIONS.toMutableList()
        if (primary.recipeCount > 0 && !isSameUnitDimension(primary.servingUnit, food.servingUnit)) {
            // The user's own recipes measure this food in the old dimension (g vs ml).
            allowed.remove(FoodPackageAction.replace)
            notes.add(FoodPackageConflictNote.replace_unit_blocked)
        } else if (primary.entryCount > 0 || primary.recipeCount > 0) {
            notes.add(FoodPackageConflictNote.replace_changes_history)
        }
        if (reason != FoodPackageConflictReason.name_brand) notes.add(FoodPackageConflictNote.barcode_dropped_on_keep_both)

        foodConflicts.add(FoodConflictMatch(food.ref, reason, primary.id, alsoMatches, allowed, notes, null))
    }

    // Several incoming foods pointing at one existing food form a group.
    for ((target, group) in groupByKey(foodConflicts) { it.existingId }) {
        if (group.size < 2) continue
        for (conflict in group) {
            conflict.targetGroup = target
            conflict.notes.add(FoodPackageConflictNote.shared_target)
        }
    }

    // Skipping a food maps the package's recipes onto the existing one — which only works if
    // the recipe's quantities are in the same dimension.
    val conflictByRef = foodConflicts.associateBy { it.ref }
    for (recipe in manifest.recipes) {
        if (recipe.ref in invalidRecipeRefs) continue
        for (ingredient in recipe.ingredients) {
            val conflict = conflictByRef[ingredient.food] ?: continue
            val existing = existingById.getValue(conflict.existingId)
            if (!isSameUnitDimension(ingredient.servingUnit, existing.servingUnit) &&
                FoodPackageConflictNote.skip_may_copy_for_recipe !in conflict.notes
            ) {
                conflict.notes.add(FoodPackageConflictNote.skip_may_copy_for_recipe)
            }
        }
    }

    val recipeStamp = { recipe: ExistingRecipe -> Stamped(recipe.id, recipe.updatedAtMillis) }
    val recipesByName = groupByKey(existingRecipes) { recipeKey(it.name) }
    val recipeConflicts = mutableListOf<RecipeConflictMatch>()
    val newRecipeRefs = mutableListOf<String>()
    for (recipe in manifest.recipes) {
        if (recipe.ref in invalidRecipeRefs) continue
        val match = newest(recipesByName[recipeKey(recipe.name)] ?: emptyList(), recipeStamp).firstOrNull()
        if (match == null) {
            newRecipeRefs.add(recipe.ref)
            continue
        }
        recipeConflicts.add(
            RecipeConflictMatch(
                recipe.ref,
                match.id,
                ALL_ACTIONS,
                if (match.entryCount > 0) mutableListOf(FoodPackageConflictNote.replace_changes_history) else mutableListOf(),
            ),
        )
    }
    for (group in groupByKey(recipeConflicts) { it.existingId }.values) {
        if (group.size < 2) continue
        for (conflict in group) conflict.notes.add(FoodPackageConflictNote.shared_target)
    }

    return MatchResult(
        barcodes = barcodes,
        foodConflicts = foodConflicts,
        newFoodRefs = newFoodRefs,
        recipeConflicts = recipeConflicts,
        newRecipeRefs = newRecipeRefs,
        invalidRecipeRefs = invalidRecipeRefs,
        issues = issues,
    )
}

sealed interface FoodOp {
    val food: PackageFood

    data class Insert(
        override val food: PackageFood,
        val barcode: String?,
        val keptBoth: Boolean,
    ) : FoodOp

    data class Replace(
        override val food: PackageFood,
        val barcode: String?,
        val id: String,
    ) : FoodOp

    data class Skip(
        override val food: PackageFood,
        val id: String,
    ) : FoodOp
}

sealed interface RecipeOp {
    val recipe: PackageRecipe

    data class Insert(
        override val recipe: PackageRecipe,
        val keptBoth: Boolean,
    ) : RecipeOp

    data class Replace(
        override val recipe: PackageRecipe,
        val id: String,
    ) : RecipeOp

    data class Skip(
        override val recipe: PackageRecipe,
        val id: String,
    ) : RecipeOp
}

data class ResolvedOperations(
    val foods: Map<String, FoodOp>,
    val recipes: Map<String, RecipeOp>,
    /** Ingredient-only foods left out because none of their recipes is imported. */
    val pruned: Int,
    val issues: List<PackageIssueNote>,
)

/** One conflict decision: a ref, the existing item it was resolved against, and the action. */
data class ResolutionChoice(
    val ref: String,
    val action: FoodPackageAction,
    val existingId: String,
)

/** A new incoming food that stands in for one of the importer's own foods. */
data class MappingChoice(
    val ref: String,
    val foodId: String,
)

private fun stale(): Nothing = throw FoodPackageException(FoodPackageException.Kind.STALE_PREVIEW, "stale_preview")

private fun badResolution(message: String): Nothing = throw FoodPackageException(FoodPackageException.Kind.BAD_RESOLUTION, message)

private fun takeResolution(
    resolutions: Map<String, ResolutionChoice>,
    ref: String,
    existingId: String,
    allowed: List<FoodPackageAction>,
): FoodPackageAction {
    val resolution = resolutions[ref]
    // The database changed since the preview (or the client skipped a conflict).
    if (resolution == null || resolution.existingId != existingId) stale()
    if (resolution.action !in allowed) badResolution("\"${resolution.action}\" is not allowed for $ref")
    return resolution.action
}

/**
 * Apply the user's choices to a match result, producing the concrete writes. A port of
 * `resolveOperations` in `match.ts`. Throws [FoodPackageException] `STALE_PREVIEW` if a conflict
 * has no (or an outdated) resolution.
 */
fun resolveOperations(
    manifest: PackageManifest,
    match: MatchResult,
    foodResolutionList: List<ResolutionChoice>,
    recipeResolutionList: List<ResolutionChoice>,
    mappings: List<MappingChoice>,
    existingFoods: List<ExistingFood>,
): ResolvedOperations {
    val issues = mutableListOf<PackageIssueNote>()
    val foodsByRef = manifest.foods.associateBy { it.ref }
    val existingById = existingFoods.associateBy { it.id }
    val foodResolutions = foodResolutionList.associateBy { it.ref }
    val recipeResolutions = recipeResolutionList.associateBy { it.ref }

    val foods = LinkedHashMap<String, FoodOp>()
    for (ref in match.newFoodRefs) {
        val food = foodsByRef.getValue(ref)
        foods[ref] = FoodOp.Insert(food, match.barcodes[ref], keptBoth = false)
    }

    val conflictReason = HashMap<String, FoodPackageConflictReason>()
    val replacedTargets = HashSet<String>()
    val unitAfterReplace = HashMap<String, String>()
    val resolvedFoodRefs = HashSet<String>()
    for (conflict in match.foodConflicts) {
        val food = foodsByRef.getValue(conflict.ref)
        conflictReason[conflict.ref] = conflict.reason
        var action = takeResolution(foodResolutions, conflict.ref, conflict.existingId, conflict.allowed)
        resolvedFoodRefs.add(conflict.ref)
        if (action == FoodPackageAction.replace && conflict.existingId in replacedTargets) {
            issues.add(
                PackageIssueNote(
                    conflict.ref,
                    "\"${food.name}\": another food in the package already replaces the same food — skipped",
                ),
            )
            action = FoodPackageAction.skip
        }
        val barcode = match.barcodes[conflict.ref]
        foods[conflict.ref] =
            when (action) {
                FoodPackageAction.replace -> {
                    replacedTargets.add(conflict.existingId)
                    unitAfterReplace[conflict.existingId] = food.servingUnit
                    FoodOp.Replace(food, barcode, conflict.existingId)
                }
                FoodPackageAction.keep_both ->
                    FoodOp.Insert(
                        food,
                        if (conflict.reason == FoodPackageConflictReason.name_brand) barcode else null,
                        keptBoth = true,
                    )
                FoodPackageAction.skip -> FoodOp.Skip(food, conflict.existingId)
            }
    }
    // A resolution the client submitted for a ref that isn't a conflict anymore (e.g. the target
    // it was resolved against was deleted, so the ref is now "new") would otherwise be silently
    // ignored — treat it as stale instead.
    if (resolvedFoodRefs.size != foodResolutions.size) stale()

    // Mappings: a new incoming food is left out and the importer's own food stands in for it.
    // Checked after conflicts, so a food that turned into a conflict since the preview reports
    // a stale preview rather than a bad request.
    val newRefs = match.newFoodRefs.toSet()
    val mapped = HashSet<String>()
    for (mapping in mappings) {
        val food = foodsByRef[mapping.ref] ?: badResolution("Cannot map ${mapping.ref}: it is not in the package")
        if (mapping.ref !in newRefs) {
            badResolution("Cannot map ${mapping.ref}: it matches one of your foods, resolve it instead")
        }
        if (!mapped.add(mapping.ref)) badResolution("${mapping.ref} is mapped more than once")
        val target = existingById[mapping.foodId]
        if (target == null || target.isSupplement) {
            badResolution("Cannot map ${mapping.ref}: the chosen food was not found")
        }
        val targetUnit = unitAfterReplace[target.id] ?: target.servingUnit
        for (recipe in manifest.recipes) {
            if (recipe.ref in match.invalidRecipeRefs) continue
            for (ingredient in recipe.ingredients) {
                if (ingredient.food != mapping.ref) continue
                if (!isSameUnitDimension(ingredient.servingUnit, targetUnit)) {
                    badResolution(
                        "Cannot map ${mapping.ref}: \"${target.name}\" uses a unit that does not fit \"${recipe.name}\"",
                    )
                }
            }
        }
        foods[mapping.ref] = FoodOp.Skip(food, target.id)
    }

    val recipes = LinkedHashMap<String, RecipeOp>()
    val recipesByRef = manifest.recipes.associateBy { it.ref }
    for (ref in match.newRecipeRefs) {
        recipes[ref] = RecipeOp.Insert(recipesByRef.getValue(ref), keptBoth = false)
    }
    val replacedRecipes = HashSet<String>()
    val resolvedRecipeRefs = HashSet<String>()
    for (conflict in match.recipeConflicts) {
        val recipe = recipesByRef.getValue(conflict.ref)
        var action = takeResolution(recipeResolutions, conflict.ref, conflict.existingId, conflict.allowed)
        resolvedRecipeRefs.add(conflict.ref)
        if (action == FoodPackageAction.replace && conflict.existingId in replacedRecipes) {
            issues.add(
                PackageIssueNote(
                    conflict.ref,
                    "\"${recipe.name}\": another recipe in the package already replaces the same recipe — skipped",
                ),
            )
            action = FoodPackageAction.skip
        }
        recipes[conflict.ref] =
            when (action) {
                FoodPackageAction.replace -> {
                    replacedRecipes.add(conflict.existingId)
                    RecipeOp.Replace(recipe, conflict.existingId)
                }
                FoodPackageAction.keep_both -> RecipeOp.Insert(recipe, keptBoth = true)
                FoodPackageAction.skip -> RecipeOp.Skip(recipe, conflict.existingId)
            }
    }
    if (resolvedRecipeRefs.size != recipeResolutions.size) stale()

    // A skipped food stands in for the incoming one inside imported recipes; if its unit can't
    // express the recipe's quantity, import a copy instead.
    val referenced = HashSet<String>()
    for (op in recipes.values) {
        if (op is RecipeOp.Skip) continue
        for (ingredient in op.recipe.ingredients) {
            referenced.add(ingredient.food)
            val foodOp = foods[ingredient.food]
            if (foodOp !is FoodOp.Skip || ingredient.food in mapped) continue
            val existing = existingById[foodOp.id]
            if (existing != null && isSameUnitDimension(ingredient.servingUnit, existing.servingUnit)) continue
            issues.add(
                PackageIssueNote(
                    foodOp.food.ref,
                    "\"${foodOp.food.name}\": your existing food uses a different unit, so a copy was imported for \"${op.recipe.name}\"",
                ),
            )
            val reason = conflictReason[foodOp.food.ref]
            val barcode = match.barcodes[foodOp.food.ref]
            foods[foodOp.food.ref] =
                FoodOp.Insert(
                    foodOp.food,
                    if (reason == FoodPackageConflictReason.name_brand) barcode else null,
                    keptBoth = true,
                )
        }
    }

    // Foods that only came along as ingredients are dropped with their recipes.
    var pruned = 0
    for (ref in match.newFoodRefs) {
        val food = foodsByRef.getValue(ref)
        if (food.role == FoodPackageFoodRole.ingredient && ref !in referenced) {
            foods.remove(ref)
            pruned += 1
        }
    }

    return ResolvedOperations(foods, recipes, pruned, issues)
}
