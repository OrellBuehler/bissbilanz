package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageConflictNote
import com.bissbilanz.api.generated.model.FoodPackageConflictReason
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Port of `src/lib/server/food-package/match.test.ts`: the same cases, the same expectations. */
class FoodPackageMatcherTest {
    private var idCounter = 0

    private fun food(
        ref: String,
        name: String = "Food $ref",
        brand: String? = null,
        role: FoodPackageFoodRole = FoodPackageFoodRole.selected,
        unit: String = "g",
        barcode: String? = null,
    ) = PackageFood(
        ref = ref,
        role = role,
        name = name,
        brand = brand,
        servingSize = 100.0,
        servingUnit = unit,
        calories = 100.0,
        protein = 1.0,
        carbs = 2.0,
        fat = 3.0,
        fiber = 4.0,
        nutrients = emptyMap(),
        barcode = barcode,
        nutriScore = null,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        labels = emptyList(),
        image = null,
        imageUrl = null,
    )

    private fun recipe(
        ref: String,
        name: String = "Recipe $ref",
        ingredients: List<PackageIngredient> = emptyList(),
    ) = PackageRecipe(ref, name, 2.0, null, null, ingredients)

    private fun ingredient(
        food: String,
        quantity: Double = 100.0,
        unit: String = "g",
    ) = PackageIngredient(food, quantity, unit)

    private fun manifest(
        foods: List<PackageFood>,
        recipes: List<PackageRecipe> = emptyList(),
    ) = PackageManifest(1, null, foods, recipes)

    private fun existing(
        name: String = "Existing",
        brand: String? = null,
        barcode: String? = null,
        unit: String = "g",
        supplement: Boolean = false,
        updatedAt: Long = 1_000,
        entryCount: Int = 0,
        recipeCount: Int = 0,
    ) = ExistingFood("food-${++idCounter}", name, brand, barcode, unit, supplement, updatedAt, entryCount, recipeCount)

    private fun existingRecipe(
        name: String = "Existing recipe",
        entryCount: Int = 0,
    ) = ExistingRecipe("recipe-${++idCounter}", name, 1_000, entryCount)

    private fun resolveAll(
        match: MatchResult,
        action: FoodPackageAction,
    ) = match.foodConflicts.map { ResolutionChoice(it.ref, action, it.existingId) } to
        match.recipeConflicts.map { ResolutionChoice(it.ref, action, it.existingId) }

    private fun resolve(
        m: PackageManifest,
        match: MatchResult,
        foods: List<ResolutionChoice> = emptyList(),
        recipes: List<ResolutionChoice> = emptyList(),
        mappings: List<MappingChoice> = emptyList(),
        existingFoods: List<ExistingFood> = emptyList(),
    ) = resolveOperations(m, match, foods, recipes, mappings, existingFoods)

    private fun kindOf(
        kind: FoodPackageException.Kind,
        block: () -> Unit,
    ) = assertEquals(kind, assertFailsWith<FoodPackageException> { block() }.kind)

    // ── matchPackage ──────────────────────────────────────────────────────

    @Test
    fun treatsUnmatchedFoodsAsNew() {
        val result = matchPackage(manifest(listOf(food("f1"))), listOf(existing(name = "Other")), emptyList())
        assertEquals(listOf("f1"), result.newFoodRefs)
        assertTrue(result.foodConflicts.isEmpty())
    }

    @Test
    fun matchesNameAndBrandIgnoringCaseAccentsAndWhitespace() {
        val target = existing(name = "Müsli  Crunchy", brand = "Migros")
        val result =
            matchPackage(manifest(listOf(food("f1", name = "musli crunchy", brand = " MIGROS "))), listOf(target), emptyList())
        val conflict = result.foodConflicts.single()
        assertEquals(FoodPackageConflictReason.name_brand, conflict.reason)
        assertEquals(target.id, conflict.existingId)
    }

    @Test
    fun doesNotMatchTheSameNameWithADifferentBrand() {
        val result =
            matchPackage(
                manifest(listOf(food("f1", name = "Milk", brand = "Coop"))),
                listOf(existing(name = "Milk", brand = "Migros")),
                emptyList(),
            )
        assertEquals(listOf("f1"), result.newFoodRefs)
    }

    @Test
    fun prefersTheBarcodeMatchWhenNameAndBarcodeHitDifferentFoods() {
        val byName = existing(name = "Oats")
        val byBarcode = existing(name = "Haferflocken", barcode = "7610000000001")
        val result =
            matchPackage(
                manifest(listOf(food("f1", name = "Oats", barcode = "7610000000001"))),
                listOf(byName, byBarcode),
                emptyList(),
            )
        val conflict = result.foodConflicts.single()
        assertEquals(FoodPackageConflictReason.barcode, conflict.reason)
        assertEquals(byBarcode.id, conflict.existingId)
        assertEquals(listOf(byName.id), conflict.alsoMatches)
        assertTrue(FoodPackageConflictNote.barcode_dropped_on_keep_both in conflict.notes)
    }

    @Test
    fun reportsBarcodeAndNameWhenBothHitTheSameFood() {
        val target = existing(name = "Oats", barcode = "123")
        val result = matchPackage(manifest(listOf(food("f1", name = "Oats", barcode = "123"))), listOf(target), emptyList())
        assertEquals(FoodPackageConflictReason.barcode_and_name, result.foodConflicts.single().reason)
    }

    @Test
    fun picksTheMostRecentlyUpdatedFoodAmongSeveralNameMatches() {
        val older = existing(name = "Oats", updatedAt = 1)
        val newer = existing(name = "Oats", updatedAt = 2)
        val result = matchPackage(manifest(listOf(food("f1", name = "Oats"))), listOf(older, newer), emptyList())
        assertEquals(newer.id, result.foodConflicts.single().existingId)
        assertEquals(listOf(older.id), result.foodConflicts.single().alsoMatches)
    }

    @Test
    fun dropsABarcodeThatAppearsTwiceInThePackage() {
        val result =
            matchPackage(
                manifest(listOf(food("f1", barcode = "42"), food("f2", barcode = " 42 "))),
                emptyList(),
                emptyList(),
            )
        assertEquals("42", result.barcodes["f1"])
        assertNull(result.barcodes["f2"])
        assertEquals(1, result.issues.size)
    }

    @Test
    fun neverConflictsWithASupplementButStillDropsItsBarcode() {
        val supplement = existing(name = "Vitamin D", supplement = true, barcode = "99")
        val result =
            matchPackage(manifest(listOf(food("f1", name = "Vitamin D", barcode = "99"))), listOf(supplement), emptyList())
        assertEquals(listOf("f1"), result.newFoodRefs)
        assertNull(result.barcodes["f1"])
    }

    @Test
    fun blocksReplaceWhenAUnitChangeWouldBreakTheUserRecipes() {
        val target = existing(name = "Milk", unit = "ml", recipeCount = 2)
        val result = matchPackage(manifest(listOf(food("f1", name = "Milk", unit = "g"))), listOf(target), emptyList())
        val conflict = result.foodConflicts.single()
        assertEquals(listOf(FoodPackageAction.skip, FoodPackageAction.keep_both), conflict.allowed)
        assertTrue(FoodPackageConflictNote.replace_unit_blocked in conflict.notes)
    }

    @Test
    fun warnsThatReplaceChangesHistoryWhenTheFoodIsLogged() {
        val target = existing(name = "Milk", entryCount = 5)
        val result = matchPackage(manifest(listOf(food("f1", name = "Milk"))), listOf(target), emptyList())
        val conflict = result.foodConflicts.single()
        assertTrue(FoodPackageAction.replace in conflict.allowed)
        assertTrue(FoodPackageConflictNote.replace_changes_history in conflict.notes)
    }

    @Test
    fun groupsIncomingFoodsThatTargetTheSameExistingFood() {
        val target = existing(name = "Oats", barcode = "1")
        val result =
            matchPackage(
                manifest(listOf(food("f1", name = "Oats"), food("f2", name = "Other", barcode = "1"))),
                listOf(target),
                emptyList(),
            )
        assertEquals(listOf(target.id, target.id), result.foodConflicts.map { it.targetGroup })
    }

    @Test
    fun flagsSkipThatWouldForceACopyForAnImportedRecipe() {
        val target = existing(name = "Milk", unit = "g")
        val result =
            matchPackage(
                manifest(
                    listOf(food("f1", name = "Milk", unit = "ml")),
                    listOf(recipe("r1", ingredients = listOf(ingredient("f1", 200.0, "ml")))),
                ),
                listOf(target),
                emptyList(),
            )
        assertTrue(FoodPackageConflictNote.skip_may_copy_for_recipe in result.foodConflicts.single().notes)
    }

    @Test
    fun rejectsRecipesWithUnknownIngredientsOrIncompatibleUnits() {
        val result =
            matchPackage(
                manifest(
                    listOf(food("f1", unit = "g")),
                    listOf(
                        recipe("r1", ingredients = listOf(ingredient("f9", 1.0, "g"))),
                        recipe("r2", ingredients = listOf(ingredient("f1", 1.0, "ml"))),
                        recipe("r3", ingredients = listOf(ingredient("f1", 1.0, "kg"))),
                    ),
                ),
                emptyList(),
                emptyList(),
            )
        assertEquals(listOf("r1", "r2"), result.invalidRecipeRefs.toList())
        assertEquals(listOf("r3"), result.newRecipeRefs)
    }

    @Test
    fun matchesRecipesByNormalizedName() {
        val target = existingRecipe(name = "Overnight Oats")
        val result = matchPackage(manifest(emptyList(), listOf(recipe("r1", name = "overnight  oats"))), emptyList(), listOf(target))
        assertEquals(target.id, result.recipeConflicts.single().existingId)
    }

    // ── resolveOperations ─────────────────────────────────────────────────

    @Test
    fun insertsNewFoodsAndAppliesEachConflictAction() {
        val a = existing(name = "A")
        val b = existing(name = "B", barcode = "2")
        val c = existing(name = "C")
        val m =
            manifest(
                listOf(
                    food("f1", name = "New"),
                    food("f2", name = "A"),
                    food("f3", name = "B", barcode = "2"),
                    food("f4", name = "C"),
                ),
            )
        val existingFoods = listOf(a, b, c)
        val match = matchPackage(m, existingFoods, emptyList())
        val ops =
            resolve(
                m,
                match,
                foods =
                    listOf(
                        ResolutionChoice("f2", FoodPackageAction.skip, a.id),
                        ResolutionChoice("f3", FoodPackageAction.keep_both, b.id),
                        ResolutionChoice("f4", FoodPackageAction.replace, c.id),
                    ),
                existingFoods = existingFoods,
            )
        assertFalse(assertIs<FoodOp.Insert>(ops.foods.getValue("f1")).keptBoth)
        assertEquals(a.id, assertIs<FoodOp.Skip>(ops.foods.getValue("f2")).id)
        // Keep both on a barcode clash stores the copy without the barcode.
        val kept = assertIs<FoodOp.Insert>(ops.foods.getValue("f3"))
        assertTrue(kept.keptBoth)
        assertNull(kept.barcode)
        assertEquals(c.id, assertIs<FoodOp.Replace>(ops.foods.getValue("f4")).id)
    }

    @Test
    fun throwsStaleWhenAConflictHasNoResolution() {
        val m = manifest(listOf(food("f1", name = "A")))
        val a = existing(name = "A")
        val match = matchPackage(m, listOf(a), emptyList())
        kindOf(FoodPackageException.Kind.STALE_PREVIEW) { resolve(m, match, existingFoods = listOf(a)) }
    }

    @Test
    fun throwsStaleWhenTheTargetChanged() {
        val m = manifest(listOf(food("f1", name = "A")))
        val a = existing(name = "A")
        val match = matchPackage(m, listOf(a), emptyList())
        kindOf(FoodPackageException.Kind.STALE_PREVIEW) {
            resolve(m, match, foods = listOf(ResolutionChoice("f1", FoodPackageAction.skip, existing().id)), existingFoods = listOf(a))
        }
    }

    @Test
    fun throwsStaleWhenAFoodResolutionTargetsARefThatIsNoLongerAConflict() {
        val target = existing(name = "A")
        val m = manifest(listOf(food("f1", name = "A")))
        assertEquals(1, matchPackage(m, listOf(target), emptyList()).foodConflicts.size)
        // The target was deleted since the preview, so f1 is now "new"; the resolution must not be ignored.
        val commitMatch = matchPackage(m, emptyList(), emptyList())
        assertEquals(listOf("f1"), commitMatch.newFoodRefs)
        kindOf(FoodPackageException.Kind.STALE_PREVIEW) {
            resolve(m, commitMatch, foods = listOf(ResolutionChoice("f1", FoodPackageAction.skip, target.id)))
        }
    }

    @Test
    fun throwsStaleWhenARecipeResolutionTargetsARefThatIsNoLongerAConflict() {
        val target = existingRecipe(name = "Porridge")
        val m = manifest(emptyList(), listOf(recipe("r1", name = "Porridge")))
        assertEquals(1, matchPackage(m, emptyList(), listOf(target)).recipeConflicts.size)
        val commitMatch = matchPackage(m, emptyList(), emptyList())
        assertEquals(listOf("r1"), commitMatch.newRecipeRefs)
        kindOf(FoodPackageException.Kind.STALE_PREVIEW) {
            resolve(m, commitMatch, recipes = listOf(ResolutionChoice("r1", FoodPackageAction.skip, target.id)))
        }
    }

    @Test
    fun rejectsADisallowedAction() {
        val m = manifest(listOf(food("f1", name = "Milk", unit = "g")))
        val target = existing(name = "Milk", unit = "ml", recipeCount = 1)
        val match = matchPackage(m, listOf(target), emptyList())
        val (foods, recipes) = resolveAll(match, FoodPackageAction.replace)
        kindOf(FoodPackageException.Kind.BAD_RESOLUTION) { resolve(m, match, foods, recipes, existingFoods = listOf(target)) }
    }

    @Test
    fun letsOnlyOneFoodReplaceASharedTarget() {
        val target = existing(name = "Oats", barcode = "1")
        val m = manifest(listOf(food("f1", name = "Oats"), food("f2", name = "X", barcode = "1")))
        val match = matchPackage(m, listOf(target), emptyList())
        val (foods, recipes) = resolveAll(match, FoodPackageAction.replace)
        val ops = resolve(m, match, foods, recipes, existingFoods = listOf(target))
        assertIs<FoodOp.Replace>(ops.foods.getValue("f1"))
        assertEquals(target.id, assertIs<FoodOp.Skip>(ops.foods.getValue("f2")).id)
        assertEquals(1, ops.issues.size)
    }

    @Test
    fun importsACopyWhenASkippedFoodCannotExpressARecipeQuantity() {
        val target = existing(name = "Milk", unit = "g")
        val m =
            manifest(
                listOf(food("f1", name = "Milk", unit = "ml")),
                listOf(recipe("r1", ingredients = listOf(ingredient("f1", 200.0, "ml")))),
            )
        val match = matchPackage(m, listOf(target), emptyList())
        val (foods, recipes) = resolveAll(match, FoodPackageAction.skip)
        val ops = resolve(m, match, foods, recipes, existingFoods = listOf(target))
        assertTrue(assertIs<FoodOp.Insert>(ops.foods.getValue("f1")).keptBoth)
    }

    @Test
    fun keepsTheSkipWhenTheUnitsAreCompatible() {
        val target = existing(name = "Milk", unit = "ml")
        val m =
            manifest(
                listOf(food("f1", name = "Milk", unit = "l")),
                listOf(recipe("r1", ingredients = listOf(ingredient("f1", 200.0, "ml")))),
            )
        val match = matchPackage(m, listOf(target), emptyList())
        val (foods, recipes) = resolveAll(match, FoodPackageAction.skip)
        val ops = resolve(m, match, foods, recipes, existingFoods = listOf(target))
        assertEquals(target.id, assertIs<FoodOp.Skip>(ops.foods.getValue("f1")).id)
    }

    @Test
    fun prunesIngredientOnlyFoodsWhoseRecipesAreNotImported() {
        val target = existingRecipe(name = "Porridge")
        val m =
            manifest(
                listOf(
                    food("f1", role = FoodPackageFoodRole.ingredient),
                    food("f2", role = FoodPackageFoodRole.ingredient),
                ),
                listOf(
                    recipe("r1", name = "Porridge", ingredients = listOf(ingredient("f1", 50.0))),
                    recipe("r2", ingredients = listOf(ingredient("f2", 50.0))),
                ),
            )
        val match = matchPackage(m, emptyList(), listOf(target))
        val (foods, recipes) = resolveAll(match, FoodPackageAction.skip)
        val ops = resolve(m, match, foods, recipes)
        assertFalse("f1" in ops.foods)
        assertIs<FoodOp.Insert>(ops.foods.getValue("f2"))
        assertEquals(1, ops.pruned)
        assertIs<RecipeOp.Skip>(ops.recipes.getValue("r1"))
        assertIs<RecipeOp.Insert>(ops.recipes.getValue("r2"))
    }

    // ── mappings ──────────────────────────────────────────────────────────

    private class Setup(
        val target: ExistingFood,
        val manifest: PackageManifest,
        val match: MatchResult,
        val foods: List<ExistingFood>,
    )

    private fun setup(): Setup {
        val target = existing(name = "My flour", unit = "g")
        val m =
            manifest(
                listOf(
                    food("f1", name = "Flour", role = FoodPackageFoodRole.ingredient),
                    food("f2", name = "Sugar", role = FoodPackageFoodRole.ingredient),
                    food("f3", name = "Loose", role = FoodPackageFoodRole.selected),
                ),
                listOf(recipe("r1", ingredients = listOf(ingredient("f1", 200.0), ingredient("f2", 50.0)))),
            )
        val foods = listOf(target)
        return Setup(target, m, matchPackage(m, foods, emptyList()), foods)
    }

    private fun Setup.run(
        mappings: List<MappingChoice>,
        existingFoods: List<ExistingFood> = foods,
    ) = resolve(manifest, match, mappings = mappings, existingFoods = existingFoods)

    @Test
    fun usesTheChosenFoodInsteadOfCreatingTheIncomingOne() {
        val s = setup()
        val ops = s.run(listOf(MappingChoice("f1", s.target.id)))
        assertEquals(s.target.id, assertIs<FoodOp.Skip>(ops.foods.getValue("f1")).id)
        assertIs<FoodOp.Insert>(ops.foods.getValue("f2"))
        assertTrue(ops.issues.isEmpty())
    }

    @Test
    fun allowsMappingASelectedFood() {
        val s = setup()
        assertEquals(s.target.id, assertIs<FoodOp.Skip>(s.run(listOf(MappingChoice("f3", s.target.id))).foods.getValue("f3")).id)
    }

    @Test
    fun createsEverythingAsBeforeWithoutMappings() {
        val s = setup()
        val ops = s.run(emptyList())
        assertTrue(ops.foods.values.all { it is FoodOp.Insert })
        assertEquals(3, ops.foods.size)
    }

    @Test
    fun rejectsAFoodThatIsNotTheImportersOrNotAFood() {
        val s = setup()
        val supplement = existing(supplement = true)
        kindOf(FoodPackageException.Kind.BAD_RESOLUTION) { s.run(listOf(MappingChoice("f1", "stranger"))) }
        kindOf(FoodPackageException.Kind.BAD_RESOLUTION) {
            s.run(listOf(MappingChoice("f1", supplement.id)), s.foods + supplement)
        }
    }

    @Test
    fun rejectsAnUnknownRefAndARefMappedTwice() {
        val s = setup()
        kindOf(FoodPackageException.Kind.BAD_RESOLUTION) { s.run(listOf(MappingChoice("f9", s.target.id))) }
        val error =
            assertFailsWith<FoodPackageException> {
                s.run(listOf(MappingChoice("f1", s.target.id), MappingChoice("f1", s.target.id)))
            }
        assertTrue("more than once" in error.message.orEmpty())
    }

    @Test
    fun rejectsMappingAConflictingFood() {
        val conflicting = existing(name = "Flour")
        val m = manifest(listOf(food("f1", name = "Flour")))
        val match = matchPackage(m, listOf(conflicting), emptyList())
        kindOf(FoodPackageException.Kind.BAD_RESOLUTION) {
            resolve(
                m,
                match,
                foods = listOf(ResolutionChoice("f1", FoodPackageAction.skip, conflicting.id)),
                mappings = listOf(MappingChoice("f1", conflicting.id)),
                existingFoods = listOf(conflicting),
            )
        }
    }

    @Test
    fun reportsAStalePreviewWhenTheMappedFoodTurnedIntoAConflict() {
        val s = setup()
        val later = existing(name = "Flour")
        val match = matchPackage(s.manifest, s.foods + later, emptyList())
        kindOf(FoodPackageException.Kind.STALE_PREVIEW) {
            resolve(s.manifest, match, mappings = listOf(MappingChoice("f1", s.target.id)), existingFoods = s.foods + later)
        }
    }

    @Test
    fun rejectsAUnitDimensionThatDoesNotFitARecipeIngredient() {
        val s = setup()
        val liquid = existing(name = "Water", unit = "ml")
        val all = s.foods + liquid
        val error = assertFailsWith<FoodPackageException> { s.run(listOf(MappingChoice("f1", liquid.id)), all) }
        assertTrue("unit" in error.message.orEmpty())
        // Nothing constrains a food no recipe uses.
        assertEquals(liquid.id, assertIs<FoodOp.Skip>(s.run(listOf(MappingChoice("f3", liquid.id)), all).foods.getValue("f3")).id)
    }

    @Test
    fun acceptsAnotherUnitOfTheSameDimension() {
        val s = setup()
        val kilo = existing(name = "Flour kg", unit = "kg")
        val ops = s.run(listOf(MappingChoice("f1", kilo.id)), s.foods + kilo)
        assertEquals(kilo.id, assertIs<FoodOp.Skip>(ops.foods.getValue("f1")).id)
    }

    @Test
    fun checksTheUnitAReplacedTargetWillHave() {
        val target = existing(name = "Flour", unit = "g")
        val m =
            manifest(
                listOf(
                    food("f1", name = "Flour", unit = "ml"),
                    food("f2", name = "Other", role = FoodPackageFoodRole.ingredient),
                ),
                listOf(recipe("r1", ingredients = listOf(ingredient("f2", 100.0, "g")))),
            )
        val match = matchPackage(m, listOf(target), emptyList())
        kindOf(FoodPackageException.Kind.BAD_RESOLUTION) {
            resolve(
                m,
                match,
                foods = listOf(ResolutionChoice("f1", FoodPackageAction.replace, target.id)),
                mappings = listOf(MappingChoice("f2", target.id)),
                existingFoods = listOf(target),
            )
        }
    }

    @Test
    fun dropsAMappedIngredientFoodWhoseRecipesAreNotImported() {
        val s = setup()
        val other = existingRecipe(name = "Recipe r1")
        val match = matchPackage(s.manifest, s.foods, listOf(other))
        val ops =
            resolve(
                s.manifest,
                match,
                recipes = listOf(ResolutionChoice("r1", FoodPackageAction.skip, other.id)),
                mappings = listOf(MappingChoice("f1", s.target.id)),
                existingFoods = s.foods,
            )
        assertFalse("f1" in ops.foods)
    }
}
