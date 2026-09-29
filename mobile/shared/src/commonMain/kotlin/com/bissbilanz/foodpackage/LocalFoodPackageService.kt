package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodPackageAlsoMatch
import com.bissbilanz.api.generated.model.FoodPackageConflicts
import com.bissbilanz.api.generated.model.FoodPackageCounts
import com.bissbilanz.api.generated.model.FoodPackageExistingFood
import com.bissbilanz.api.generated.model.FoodPackageExistingRecipe
import com.bissbilanz.api.generated.model.FoodPackageFoodConflict
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import com.bissbilanz.api.generated.model.FoodPackageFoodSummary
import com.bissbilanz.api.generated.model.FoodPackageImportResult
import com.bissbilanz.api.generated.model.FoodPackageIncludeRecipes
import com.bissbilanz.api.generated.model.FoodPackageIssue
import com.bissbilanz.api.generated.model.FoodPackageNewFood
import com.bissbilanz.api.generated.model.FoodPackageNewFoodItem
import com.bissbilanz.api.generated.model.FoodPackageNewFoodRecipe
import com.bissbilanz.api.generated.model.FoodPackageNewFoods
import com.bissbilanz.api.generated.model.FoodPackageNewRecipe
import com.bissbilanz.api.generated.model.FoodPackageNewRecipes
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageRecipeConflict
import com.bissbilanz.api.generated.model.FoodPackageRecipeSummary
import com.bissbilanz.api.generated.model.FoodPackageResolutions
import com.bissbilanz.api.generated.model.FoodPackageSelection
import com.bissbilanz.api.generated.model.FoodPackageSummaryResponse
import com.bissbilanz.api.generated.model.FoodPackageTotals
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.Failures
import com.bissbilanz.util.MAX_LABELS_PER_FOOD
import com.bissbilanz.util.computeRecipePerServingMacros
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.newTempId
import com.bissbilanz.util.normalizeLabels
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.withContext
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.math.floor
import kotlin.time.Clock
import kotlin.time.Instant

/** A finished export: the zip bytes and the file name to share it under. */
class ExportedPackage(
    val bytes: ByteArray,
    val fileName: String,
    val foods: Int,
    val recipes: Int,
)

/**
 * Food packages without a server, for Local mode: the same preview, import and export the
 * server does, against the on-device database. Everything a package decides — matching,
 * conflict resolution, the file format — lives in the pure functions this class calls
 * ([matchPackage], [resolveOperations], [FoodPackageManifestCodec]), which mirror
 * `src/lib/server/food-package/`. It produces the very DTOs the server's endpoints return,
 * so the import screen cannot tell the two modes apart.
 *
 * Nothing here is enqueued for sync: in Local mode the database is the only store.
 */
class LocalFoodPackageService(
    private val db: UserDataDatabase,
    private val json: Json,
    private val archive: FoodPackageArchive,
    private val images: PackageImageStore,
    private val now: () -> String = { Clock.System.now().toString() },
    private val today: () -> String = { Clock.System.todayIn(TimeZone.currentSystemDefault()).toString() },
) {
    private val queries get() = db.userDataDatabaseQueries

    // ── Context ───────────────────────────────────────────────────────────

    private class ImportContext(
        val foods: List<Food>,
        val recipes: List<RecipeDetail>,
        val existingFoods: List<ExistingFood>,
        val existingRecipes: List<ExistingRecipe>,
    )

    private fun millis(iso: String?): Long {
        if (iso == null) return 0
        return try {
            Instant.parse(iso).toEpochMilliseconds()
        } catch (e: IllegalArgumentException) {
            Failures.report(e)
            0
        }
    }

    private fun loadContext(): ImportContext {
        val foods = queries.selectAllFoods().executeAsList().mapNotNull { json.decodeOrNull<Food>(it.jsonData) }
        val recipes = queries.selectAllRecipes().executeAsList().mapNotNull { json.decodeOrNull<RecipeDetail>(it.jsonData) }
        val entriesPerFood = queries.countEntriesPerFood().executeAsList().associate { it.foodId to it.entryCount.toInt() }
        val entriesPerRecipe = queries.countEntriesPerRecipe().executeAsList().associate { it.recipeId to it.entryCount.toInt() }
        val inRecipes = HashMap<String, Int>()
        for (recipe in recipes) {
            for (ingredient in recipe.ingredients) inRecipes[ingredient.foodId] = (inRecipes[ingredient.foodId] ?: 0) + 1
        }
        return ImportContext(
            foods = foods,
            recipes = recipes,
            existingFoods =
                foods.map {
                    ExistingFood(
                        id = it.id,
                        name = it.name,
                        brand = it.brand,
                        barcode = it.barcode,
                        servingUnit = it.servingUnit.value,
                        isSupplement = false,
                        updatedAtMillis = millis(it.updatedAt),
                        entryCount = entriesPerFood[it.id] ?: 0,
                        recipeCount = inRecipes[it.id] ?: 0,
                    )
                },
            existingRecipes =
                recipes.map {
                    ExistingRecipe(it.id, it.name, millis(it.updatedAt), entriesPerRecipe[it.id] ?: 0)
                },
        )
    }

    // ── Preview ───────────────────────────────────────────────────────────

    private fun round1(value: Double): Double = floor(value * 10 + 0.5) / 10

    private fun unitOf(value: String) = FoodPackageFoodSummary.ServingUnit.entries.first { it.value == value }

    private fun existingUnitOf(value: String) = FoodPackageExistingFood.ServingUnit.entries.first { it.value == value }

    private fun newUnitOf(value: String) = FoodPackageNewFoodItem.ServingUnit.entries.first { it.value == value }

    suspend fun preview(path: String): FoodPackagePreviewResponse =
        withContext(Dispatchers.IO) {
            val pkg = archive.read(path)
            val manifest = pkg.manifest
            val context = loadContext()
            val match = matchPackage(manifest, context.existingFoods, context.existingRecipes)
            val foodsByRef = manifest.foods.associateBy { it.ref }
            val recipesByRef = manifest.recipes.associateBy { it.ref }
            val foodsById = context.foods.associateBy { it.id }
            val recipesById = context.recipes.associateBy { it.id }
            val existingStats = context.existingFoods.associateBy { it.id }
            val recipeStats = context.existingRecipes.associateBy { it.id }

            val thumbnailPaths =
                (
                    match.foodConflicts.mapNotNull { foodsByRef.getValue(it.ref).image } +
                        match.recipeConflicts.mapNotNull { recipesByRef.getValue(it.ref).image }
                ).distinct().take(MAX_PREVIEW_THUMBNAILS)
            val thumbnails = HashMap<String, String>()
            if (thumbnailPaths.isNotEmpty()) {
                for ((imagePath, bytes) in pkg.readImages(thumbnailPaths)) {
                    images.thumbnail(bytes)?.let { thumbnails[imagePath] = it }
                }
            }
            val thumbFor = { imagePath: String? -> imagePath?.let { thumbnails[it] } }

            val foodConflicts =
                match.foodConflicts.map { conflict ->
                    val incoming = foodsByRef.getValue(conflict.ref)
                    val row = foodsById.getValue(conflict.existingId)
                    val stats = existingStats.getValue(conflict.existingId)
                    FoodPackageFoodConflict(
                        ref = conflict.ref,
                        reason = conflict.reason,
                        incoming =
                            FoodPackageFoodSummary(
                                name = incoming.name,
                                brand = incoming.brand,
                                servingSize = incoming.servingSize,
                                servingUnit = unitOf(incoming.servingUnit),
                                calories = round1(incoming.calories),
                                protein = round1(incoming.protein),
                                carbs = round1(incoming.carbs),
                                fat = round1(incoming.fat),
                                fiber = round1(incoming.fiber),
                                barcode = trimBarcode(incoming.barcode),
                                labels = incoming.labels,
                                imageUrl = thumbFor(incoming.image) ?: packageImageUrl(incoming.imageUrl),
                            ),
                        existing =
                            FoodPackageExistingFood(
                                name = row.name,
                                brand = row.brand,
                                servingSize = row.servingSize,
                                servingUnit = existingUnitOf(row.servingUnit.value),
                                calories = round1(row.calories),
                                protein = round1(row.protein),
                                carbs = round1(row.carbs),
                                fat = round1(row.fat),
                                fiber = round1(row.fiber),
                                barcode = row.barcode,
                                labels = row.labels.orEmpty(),
                                imageUrl = row.imageUrl,
                                id = row.id,
                                entryCount = stats.entryCount,
                                recipeCount = stats.recipeCount,
                            ),
                        alsoMatches =
                            conflict.alsoMatches
                                .mapNotNull { foodsById[it] }
                                .map { FoodPackageAlsoMatch(it.id, it.name, it.brand) },
                        allowed = conflict.allowed,
                        notes = conflict.notes,
                        targetGroup = conflict.targetGroup,
                    )
                }

            val recipeConflicts =
                match.recipeConflicts.map { conflict ->
                    val incoming = recipesByRef.getValue(conflict.ref)
                    val row = recipesById.getValue(conflict.existingId)
                    FoodPackageRecipeConflict(
                        ref = conflict.ref,
                        incoming =
                            FoodPackageRecipeSummary(
                                name = incoming.name,
                                totalServings = incoming.totalServings,
                                cookedWeight = incoming.cookedWeight,
                                ingredients = incoming.ingredients.map { foodsByRef.getValue(it.food).name },
                                imageUrl = thumbFor(incoming.image),
                            ),
                        existing =
                            FoodPackageExistingRecipe(
                                name = row.name,
                                totalServings = row.totalServings,
                                cookedWeight = row.cookedWeight,
                                ingredients = row.ingredients.sortedBy { it.sortOrder }.mapNotNull { foodsById[it.foodId]?.name },
                                imageUrl = row.imageUrl,
                                id = row.id,
                                entryCount = recipeStats.getValue(row.id).entryCount,
                            ),
                        allowed = conflict.allowed,
                        notes = conflict.notes,
                    )
                }

            val newFoods = match.newFoodRefs.map { foodsByRef.getValue(it) }
            val recipesByFood = LinkedHashMap<String, MutableList<FoodPackageNewFoodRecipe>>()
            for (recipe in manifest.recipes) {
                if (recipe.ref in match.invalidRecipeRefs) continue
                for (ref in recipe.ingredients.map { it.food }.distinct()) {
                    recipesByFood.getOrPut(ref) { mutableListOf() }.add(FoodPackageNewFoodRecipe(recipe.ref, recipe.name))
                }
            }
            // An ingredient-only food no importable recipe uses is never created.
            val newFoodItems =
                newFoods
                    .filter { it.role == FoodPackageFoodRole.selected || it.ref in recipesByFood }
                    .map { food ->
                        FoodPackageNewFoodItem(
                            ref = food.ref,
                            role = food.role,
                            name = food.name,
                            brand = food.brand,
                            servingSize = food.servingSize,
                            servingUnit = newUnitOf(food.servingUnit),
                            calories = round1(food.calories),
                            recipes = recipesByFood[food.ref].orEmpty(),
                        )
                    }
            val selectedNew = newFoods.filter { it.role == FoodPackageFoodRole.selected }
            val imageCount = manifest.foods.count { it.image != null } + manifest.recipes.count { it.image != null }

            FoodPackagePreviewResponse(
                packageHash = pkg.packageHash,
                formatVersion = manifest.formatVersion,
                exportedAt = manifest.exportedAt,
                totals = FoodPackageTotals(manifest.foods.size, manifest.recipes.size, imageCount),
                newFoods =
                    FoodPackageNewFoods(
                        count = newFoods.size,
                        ingredientOnly = newFoods.size - selectedNew.size,
                        samples =
                            (selectedNew + newFoods.filter { it.role == FoodPackageFoodRole.ingredient })
                                .take(MAX_PREVIEW_SAMPLES)
                                .map { FoodPackageNewFood(it.ref, it.name, it.brand, round1(it.calories)) },
                        items = newFoodItems,
                    ),
                newRecipes =
                    FoodPackageNewRecipes(
                        count = match.newRecipeRefs.size,
                        samples =
                            match.newRecipeRefs
                                .take(MAX_PREVIEW_SAMPLES)
                                .map { FoodPackageNewRecipe(it, recipesByRef.getValue(it).name) },
                    ),
                conflicts = FoodPackageConflicts(foodConflicts, recipeConflicts),
                issues = match.issues.take(MAX_ISSUES).map { FoodPackageIssue(it.ref, it.message) },
            )
        }

    // ── Import ────────────────────────────────────────────────────────────

    private class Counts {
        var foods = 0
        var recipes = 0

        fun toDto() = FoodPackageCounts(foods, recipes)
    }

    private fun toChoices(resolutions: List<com.bissbilanz.api.generated.model.FoodPackageResolution>?) =
        resolutions.orEmpty().map { ResolutionChoice(it.ref, it.action, it.existingId) }

    /**
     * Apply a package with the user's conflict choices, all-or-nothing. The plan is re-derived
     * from the database rather than trusted from the preview: if anything a choice was made
     * against has changed, nothing is written and [FoodPackageException] `STALE_PREVIEW` asks
     * the caller to preview again.
     */
    suspend fun commit(
        path: String,
        resolutions: FoodPackageResolutions,
    ): FoodPackageImportResult =
        withContext(Dispatchers.IO) {
            val pkg = archive.read(path)
            if (resolutions.packageHash != pkg.packageHash) {
                throw FoodPackageException(FoodPackageException.Kind.PACKAGE_CHANGED, "package_changed")
            }
            val manifest = pkg.manifest
            val context = loadContext()
            val match = matchPackage(manifest, context.existingFoods, context.existingRecipes)
            val ops =
                resolveOperations(
                    manifest,
                    match,
                    toChoices(resolutions.foods),
                    toChoices(resolutions.recipes),
                    resolutions.mappings.orEmpty().map { MappingChoice(it.ref, it.foodId) },
                    context.existingFoods,
                )
            val issues = (match.issues + ops.issues).toMutableList()

            // Images are stored before the transaction; a rollback leaves only files, dropped below.
            class ImageJob(
                val path: String,
                val name: String,
                val ref: String,
            )
            val jobs = mutableListOf<ImageJob>()
            for (op in ops.foods.values) {
                if (op !is FoodOp.Skip) op.food.image?.let { jobs.add(ImageJob(it, op.food.name, op.food.ref)) }
            }
            for (op in ops.recipes.values) {
                if (op !is RecipeOp.Skip) op.recipe.image?.let { jobs.add(ImageJob(it, op.recipe.name, op.recipe.ref)) }
            }
            val imageBytes = pkg.readImages(jobs.map { it.path }.distinct())
            val imageByRef = HashMap<String, String>()
            val written = mutableListOf<String>()
            try {
                for (job in jobs) {
                    val bytes = imageBytes[job.path]
                    if (bytes == null) {
                        issues.add(PackageIssueNote(job.ref, "\"${job.name}\": image missing from the package"))
                        continue
                    }
                    val stored = images.saveImported(bytes)
                    if (stored == null) {
                        issues.add(PackageIssueNote(job.ref, "\"${job.name}\": image could not be read"))
                        continue
                    }
                    written.add(stored)
                    imageByRef[job.ref] = stored
                }
            } catch (e: Exception) {
                written.forEach { images.discard(it) }
                throw e
            }

            val created = Counts()
            val replaced = Counts()
            val keptBoth = Counts()
            val skipped = Counts()
            val superseded = mutableListOf<String>()
            try {
                writeAll(ops, imageByRef, created, replaced, keptBoth, skipped, superseded, context)
            } catch (e: Exception) {
                written.forEach { images.discard(it) }
                throw e
            }
            superseded.forEach { images.discard(it) }

            FoodPackageImportResult(
                created = created.toDto(),
                replaced = replaced.toDto(),
                keptBoth = keptBoth.toDto(),
                skipped = skipped.toDto(),
                images = written.size,
                issues = issues.take(MAX_ISSUES).map { FoodPackageIssue(it.ref, it.message) },
            )
        }

    private fun writeFood(food: Food) {
        queries.deleteFoodLabels(food.id)
        food.labels?.forEach { label -> queries.insertFoodLabel(food.id, label) }
        queries.insertFood(
            id = food.id,
            name = food.name,
            brand = food.brand,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            isFavorite = if (food.isFavorite) 1L else 0L,
            barcode = food.barcode,
            jsonData = json.encodeToString(food),
        )
    }

    private fun writeRecipe(recipe: RecipeDetail) {
        queries.insertRecipe(
            id = recipe.id,
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = if (recipe.isFavorite) 1L else 0L,
            calories = recipe.calories,
            protein = recipe.protein,
            carbs = recipe.carbs,
            fat = recipe.fat,
            fiber = recipe.fiber,
            jsonData = json.encodeToString(recipe),
        )
    }

    private fun stale(): Nothing = throw FoodPackageException(FoodPackageException.Kind.STALE_PREVIEW, "stale_preview")

    private fun writeAll(
        ops: ResolvedOperations,
        imageByRef: Map<String, String>,
        created: Counts,
        replaced: Counts,
        keptBoth: Counts,
        skipped: Counts,
        superseded: MutableList<String>,
        context: ImportContext,
    ) {
        val stamp = now()
        val foodsById = LinkedHashMap(context.foods.associateBy { it.id })
        val foodIdByRef = HashMap<String, String>()
        val replacedFoodIds = HashSet<String>()
        val writtenRecipeIds = HashSet<String>()

        queries.transaction {
            for (op in ops.foods.values) {
                when (op) {
                    is FoodOp.Skip -> {
                        foodIdByRef[op.food.ref] = op.id
                        skipped.foods += 1
                    }
                    is FoodOp.Insert -> {
                        val id = newTempId()
                        foodIdByRef[op.food.ref] = id
                        val imageUrl = imageByRef[op.food.ref] ?: packageImageUrl(op.food.imageUrl)
                        val food = op.food.toNewFood(id, op.barcode, imageUrl, normalizeLabels(op.food.labels), stamp)
                        writeFood(food)
                        foodsById[id] = food
                        if (op.keptBoth) keptBoth.foods += 1 else created.foods += 1
                    }
                    is FoodOp.Replace -> {
                        val existing = queries.selectFoodById(op.id).executeAsOneOrNull()?.let { json.decodeOrNull<Food>(it.jsonData) }
                        if (existing == null) stale()
                        val newImage = imageByRef[op.food.ref] ?: packageImageUrl(op.food.imageUrl)
                        // Imported labels are added next to (never replacing) what the importer has.
                        val labels =
                            (existing.labels.orEmpty() + normalizeLabels(op.food.labels))
                                .distinct()
                                .take(MAX_LABELS_PER_FOOD)
                        val food = op.food.replaceInto(existing, op.barcode, newImage, labels, stamp)
                        writeFood(food)
                        foodsById[op.id] = food
                        foodIdByRef[op.food.ref] = op.id
                        replacedFoodIds.add(op.id)
                        val oldImage = existing.imageUrl
                        if (newImage != null && oldImage != null && oldImage != newImage) superseded.add(oldImage)
                        replaced.foods += 1
                    }
                }
            }

            val recipeMacros = { ingredients: List<RecipeIngredient>, servings: Double ->
                computeRecipePerServingMacros(ingredients, servings) { foodsById[it] }
            }

            fun ingredientsOf(recipe: PackageRecipe) =
                recipe.ingredients.mapIndexed { index, ingredient ->
                    RecipeIngredient(
                        foodId = foodIdByRef.getValue(ingredient.food),
                        quantity = ingredient.quantity,
                        servingUnit = RecipeIngredient.ServingUnit.entries.first { it.value == ingredient.servingUnit },
                        sortOrder = index,
                    )
                }

            for (op in ops.recipes.values) {
                when (op) {
                    is RecipeOp.Skip -> skipped.recipes += 1
                    is RecipeOp.Insert -> {
                        val ingredients = ingredientsOf(op.recipe)
                        val macros = recipeMacros(ingredients, op.recipe.totalServings)
                        val recipe =
                            RecipeDetail(
                                id = newTempId(),
                                userId = "",
                                name = op.recipe.name,
                                totalServings = op.recipe.totalServings,
                                isFavorite = false,
                                imageUrl = imageByRef[op.recipe.ref],
                                calories = macros?.calories ?: 0.0,
                                protein = macros?.protein ?: 0.0,
                                carbs = macros?.carbs ?: 0.0,
                                fat = macros?.fat ?: 0.0,
                                fiber = macros?.fiber ?: 0.0,
                                ingredients = ingredients,
                                cookedWeight = op.recipe.cookedWeight,
                                createdAt = stamp,
                                updatedAt = stamp,
                            )
                        writeRecipe(recipe)
                        writtenRecipeIds.add(recipe.id)
                        if (op.keptBoth) keptBoth.recipes += 1 else created.recipes += 1
                    }
                    is RecipeOp.Replace -> {
                        val old =
                            queries.selectRecipeById(op.id).executeAsOneOrNull()?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) }
                        if (old == null) stale()
                        val ingredients = ingredientsOf(op.recipe)
                        val macros = recipeMacros(ingredients, op.recipe.totalServings)
                        val newImage = imageByRef[op.recipe.ref]
                        val recipe =
                            old.copy(
                                name = op.recipe.name,
                                totalServings = op.recipe.totalServings,
                                cookedWeight = op.recipe.cookedWeight,
                                imageUrl = newImage ?: old.imageUrl,
                                ingredients = ingredients,
                                calories = macros?.calories ?: old.calories,
                                protein = macros?.protein ?: old.protein,
                                carbs = macros?.carbs ?: old.carbs,
                                fat = macros?.fat ?: old.fat,
                                fiber = macros?.fiber ?: old.fiber,
                                updatedAt = stamp,
                            )
                        writeRecipe(recipe)
                        writtenRecipeIds.add(recipe.id)
                        val oldImage = old.imageUrl
                        if (newImage != null && oldImage != null && oldImage != newImage) superseded.add(oldImage)
                        replaced.recipes += 1
                    }
                }
            }

            // The server computes recipe totals live, so a replaced food changes every recipe using it.
            if (replacedFoodIds.isNotEmpty()) {
                for (recipe in context.recipes) {
                    if (recipe.id in writtenRecipeIds || recipe.ingredients.none { it.foodId in replacedFoodIds }) continue
                    val macros = recipeMacros(recipe.ingredients, recipe.totalServings) ?: continue
                    writeRecipe(
                        recipe.copy(
                            calories = macros.calories,
                            protein = macros.protein,
                            carbs = macros.carbs,
                            fat = macros.fat,
                            fiber = macros.fiber,
                        ),
                    )
                }
            }
        }
    }

    // ── Export ────────────────────────────────────────────────────────────

    private class SelectedFood(
        val food: Food,
        val role: FoodPackageFoodRole,
    )

    private class Selection(
        val foods: List<SelectedFood>,
        val recipes: List<RecipeDetail>,
    )

    private val foodOrder =
        compareBy<Food>({ it.name.lowercase() }, { it.id })

    private val recipeOrder =
        compareBy<RecipeDetail>({ it.name.lowercase() }, { it.id })

    /**
     * Turn an export request into the rows that go into the package — `resolvePackageSelection`
     * in `selection.ts`. Foods: `all`, or the union of `foodIds` and every food whose brand OR
     * labels match the filter. Recipes: `recipeIds`, plus every recipe (`all`) or the ones using
     * a selected food (`related`). An exported recipe always brings its ingredient foods along.
     */
    private fun resolveSelection(
        selection: FoodPackageSelection,
        context: ImportContext,
    ): Selection {
        val includeRecipes =
            selection.includeRecipes
                ?: if (selection.all == true) FoodPackageIncludeRecipes.all else FoodPackageIncludeRecipes.none

        val selectedFoods: List<Food> =
            if (selection.all == true) {
                context.foods
            } else {
                val ids = selection.foodIds.orEmpty().toSet()
                val brands =
                    selection.brands
                        .orEmpty()
                        .map { it.trim().lowercase() }
                        .toSet()
                val labels = normalizeLabels(selection.labels.orEmpty()).toSet()
                context.foods.filter { food ->
                    food.id in ids ||
                        (brands.isNotEmpty() && food.brand?.trim()?.lowercase() in brands) ||
                        (labels.isNotEmpty() && food.labels.orEmpty().any { it in labels })
                }
            }.sortedWith(foodOrder)
        if (selectedFoods.size > MAX_PACKAGE_FOODS) {
            throw FoodPackageException(
                FoodPackageException.Kind.TOO_LARGE,
                "A package can hold at most $MAX_PACKAGE_FOODS foods",
            )
        }
        val selectedFoodIds = selectedFoods.map { it.id }.toSet()

        val recipeIds = selection.recipeIds.orEmpty().toSet()
        val selectedRecipes =
            context.recipes
                .filter { recipe ->
                    includeRecipes == FoodPackageIncludeRecipes.all ||
                        recipe.id in recipeIds ||
                        (
                            includeRecipes == FoodPackageIncludeRecipes.related &&
                                selectedFoodIds.isNotEmpty() &&
                                recipe.ingredients.any { it.foodId in selectedFoodIds }
                        )
                }.sortedWith(recipeOrder)
        if (selectedRecipes.size > MAX_PACKAGE_RECIPES) {
            throw FoodPackageException(
                FoodPackageException.Kind.TOO_LARGE,
                "A package can hold at most $MAX_PACKAGE_RECIPES recipes",
            )
        }

        val foodsById = context.foods.associateBy { it.id }
        val closureIds =
            selectedRecipes
                .flatMap { recipe -> recipe.ingredients.map { it.foodId } }
                .filter { it !in selectedFoodIds }
                .distinct()
        val closure = closureIds.mapNotNull { foodsById[it] }
        val all =
            selectedFoods.map { SelectedFood(it, FoodPackageFoodRole.selected) } +
                closure.map { SelectedFood(it, FoodPackageFoodRole.ingredient) }
        if (all.size > MAX_PACKAGE_FOODS) {
            throw FoodPackageException(
                FoodPackageException.Kind.TOO_LARGE,
                "A package can hold at most $MAX_PACKAGE_FOODS foods",
            )
        }
        return Selection(all, selectedRecipes)
    }

    /** What an export would contain, without building it — drives the count preview. */
    suspend fun summarize(selection: FoodPackageSelection): FoodPackageSummaryResponse =
        withContext(Dispatchers.IO) {
            val chosen = resolveSelection(selection, loadContext())
            val urls =
                (chosen.foods.mapNotNull { it.food.imageUrl } + chosen.recipes.mapNotNull { it.imageUrl }).distinct()
            val sizes = urls.mapNotNull { images.size(it) }
            val estimated = sizes.sum() + (chosen.foods.size + chosen.recipes.size) * BYTES_PER_ITEM
            FoodPackageSummaryResponse(
                foods = chosen.foods.count { it.role == FoodPackageFoodRole.selected },
                recipes = chosen.recipes.size,
                ingredientFoods = chosen.foods.count { it.role == FoodPackageFoodRole.ingredient },
                images = sizes.size,
                estimatedBytes = estimated.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
                maxBytes = MAX_PACKAGE_BYTES.toInt(),
                overLimit = estimated > MAX_PACKAGE_BYTES,
            )
        }

    private fun imageExtension(bytes: ByteArray): String? =
        when {
            bytes.size >= 12 &&
                bytes.copyOfRange(0, 4).decodeToString() == "RIFF" &&
                bytes.copyOfRange(8, 12).decodeToString() == "WEBP" -> "webp"
            bytes.size >= 4 &&
                bytes[0] == 0x89.toByte() &&
                bytes[1] == 0x50.toByte() &&
                bytes[2] == 0x4E.toByte() &&
                bytes[3] == 0x47.toByte() -> "png"
            bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte() -> "jpg"
            else -> null
        }

    /** Build the package for [selection]; [exportedAt] is the manifest's timestamp (now, unless a test fixes it). */
    suspend fun export(
        selection: FoodPackageSelection,
        exportedAt: String? = null,
    ): ExportedPackage =
        withContext(Dispatchers.IO) {
            val chosen = resolveSelection(selection, loadContext())
            if (chosen.foods.isEmpty() && chosen.recipes.isEmpty()) {
                throw FoodPackageException(
                    FoodPackageException.Kind.NOTHING_TO_EXPORT,
                    "Nothing to export: the selection matches no foods or recipes",
                )
            }
            val sortedFoods = chosen.foods.sortedWith(compareBy({ it.food.name.lowercase() }, { it.food.id }))
            val refByFoodId = sortedFoods.mapIndexed { index, selected -> selected.food.id to "f${index + 1}" }.toMap()

            val imageFiles = LinkedHashMap<String, ByteArray>()

            suspend fun addImage(
                imageUrl: String?,
                ref: String,
            ): String? {
                if (imageUrl == null) return null
                val bytes = images.read(imageUrl) ?: return null
                if (bytes.size > MAX_IMAGE_ENTRY_BYTES) return null
                val extension = imageExtension(bytes) ?: return null
                val path = "images/$ref.$extension"
                imageFiles[path] = bytes
                return path
            }

            val manifestFoods =
                sortedFoods.map { selected ->
                    val ref = refByFoodId.getValue(selected.food.id)
                    val image = addImage(selected.food.imageUrl, ref)
                    // An uploaded image travels as bytes; only an allow-listed public URL travels as a URL.
                    val imageUrl =
                        if (image != null || selected.food.imageUrl?.startsWith("/") == true) {
                            null
                        } else {
                            allowedImageUrl(selected.food.imageUrl)
                        }
                    selected.food.toPackageFood(ref, selected.role, image, imageUrl)
                }
            val manifestRecipes =
                chosen.recipes.mapIndexed { index, recipe ->
                    val ref = "r${index + 1}"
                    PackageRecipe(
                        ref = ref,
                        name = recipe.name,
                        totalServings = recipe.totalServings,
                        cookedWeight = recipe.cookedWeight,
                        image = addImage(recipe.imageUrl, ref),
                        ingredients =
                            recipe.ingredients
                                .sortedBy { it.sortOrder }
                                .mapNotNull { ingredient ->
                                    refByFoodId[ingredient.foodId]?.let {
                                        PackageIngredient(it, ingredient.quantity, ingredient.servingUnit.value)
                                    }
                                },
                    )
                }
            val manifest = PackageManifest(FOOD_PACKAGE_VERSION, exportedAt ?: now(), manifestFoods, manifestRecipes)
            val bytes = archive.write(FoodPackageManifestCodec.encode(manifest), imageFiles)
            if (bytes.size > MAX_PACKAGE_BYTES) {
                throw FoodPackageException(
                    FoodPackageException.Kind.TOO_LARGE,
                    "The package is larger than ${MAX_PACKAGE_BYTES / 1024 / 1024}MB — export fewer foods at once",
                )
            }
            ExportedPackage(
                bytes = bytes,
                fileName =
                    packageFilename(
                        recipes = chosen.recipes.map { it.name },
                        foods = chosen.foods.filter { it.role == FoodPackageFoodRole.selected }.map { it.food.name },
                        today = today(),
                    ),
                foods = manifestFoods.size,
                recipes = manifestRecipes.size,
            )
        }

    private companion object {
        /** Rough JSON size of one item; only feeds the size estimate shown before export. */
        const val BYTES_PER_ITEM = 1500
    }
}
