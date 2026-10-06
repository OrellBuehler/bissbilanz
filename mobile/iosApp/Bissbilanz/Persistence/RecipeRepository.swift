import Foundation
import Observation
import SwiftData

/// Local-first repository for recipes. List/detail reads come from SwiftData;
/// `refresh()` upserts the server list by id (Android parity). Writes are
/// SwiftData-first with the upload queued via the sync manager; optimistic
/// rows carry macros computed from the ingredient foods in the local store
/// (replicating the server's aggregation, which replaces them on refresh in
/// Synced mode). In Local mode nothing is queued and refreshes are no-ops —
/// the locally computed macros are authoritative.
@MainActor
@Observable
final class RecipeRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let syncManager: SyncManager

    init(context: ModelContext, api: BissbilanzAPI, appMode: AppModeManager, syncManager: SyncManager) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
    }

    // MARK: - Reads (local)

    func recipes() -> [Recipe] {
        let descriptor = FetchDescriptor<LocalRecipe>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toRecipe() }
    }

    func favoriteRecipes() -> [Recipe] {
        let descriptor = FetchDescriptor<LocalRecipe>(
            predicate: #Predicate { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toRecipe() }
    }

    func recipe(id: String) -> Recipe? {
        fetchRow(id: TempIdMap.resolved(id))?.toRecipe()
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getRecipes()
        let serverIds = Set(fetched.map(\.id))
        // The list endpoint is the complete set — drop rows deleted elsewhere
        // Rows with an un-uploaded queued write — including optimistic temp
        // rows whose create is still queued — must survive the server response:
        // a refresh racing the sync-queue upload would otherwise reapply the
        // stale server copy over the user's edit (see EntryRepository.refresh,
        // PR #416). A temp row with no queued op left is a dropped create and
        // goes with the rest.
        let pendingIds = syncManager.pendingAffectedIds(table: "recipes")
        for stale in recipes() where !serverIds.contains(stale.id) && !pendingIds.contains(stale.id) {
            deleteRow(id: stale.id)
        }
        for recipe in fetched where !pendingIds.contains(recipe.id) {
            upsert(recipe)
        }
        save()
    }

    func refreshRecipe(id: String) async throws {
        let id = TempIdMap.resolved(id)
        guard !appMode.isLocal, !LocalStore.isTempId(id) else { return }
        let recipe = try await api.getRecipe(id: id)
        guard !syncManager.pendingAffectedIds(table: "recipes").contains(id) else { return }
        upsert(recipe)
        save()
    }

    // MARK: - Writes (local first + queued upload)

    @discardableResult
    func createRecipe(_ create: RecipeCreate) async throws -> Recipe {
        let temp = makeRecipe(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createRecipe(body: create, localId: temp.id))
        return temp
    }

    /// Copies a recipe (ingredients, servings, cooked weight, steps) under a new
    /// name, not favorited, without its cover image — two recipes must never
    /// share one `imageUrl`, since the server's upload cleanup has no reference
    /// count for covers and would delete the file out from under whichever
    /// recipe keeps it once the other's image changes or is deleted. Step photos
    /// are different: the server counts references to them before unlinking, so
    /// a server-hosted step photo is shared as is, while a Local-mode `file://`
    /// photo (the only copy there is, and evicted with its step) is copied to a
    /// file of its own. Goes through `createRecipe` so it works offline the same
    /// way.
    @discardableResult
    func duplicateRecipe(id: String, name: String) async throws -> Recipe {
        let id = TempIdMap.resolved(id)
        guard let source = recipe(id: id) else { throw APIError.notFound }
        let inputs = (source.ingredients ?? []).map { ingredient in
            RecipeIngredientInput(
                foodId: ingredient.foodId,
                quantity: ingredient.quantity,
                servingUnit: ingredient.servingUnit
            )
        }
        let steps = source.orderedSteps.map { step in
            RecipeStepInput(text: step.text, imageUrl: Self.duplicatedStepPhoto(step.imageUrl))
        }
        let create = RecipeCreate(
            name: name,
            totalServings: source.totalServings,
            ingredients: inputs,
            isFavorite: false,
            imageUrl: nil,
            cookedWeight: source.cookedWeight,
            steps: steps.isEmpty ? nil : steps
        )
        return try await createRecipe(create)
    }

    /// See `EntryRepository.updateEntry` — a missing local row is reported as a
    /// failure without also queueing an upload the caller was just told failed.
    @discardableResult
    func updateRecipe(id: String, _ update: RecipeUpdate) async throws -> Recipe {
        let id = TempIdMap.resolved(id)
        guard let row = fetchRow(id: id), let existing = row.toRecipe() else {
            throw APIError.notFound
        }
        // Patch semantics throughout: `RecipeUpdate` omits its nil optionals,
        // so an absent key means "leave this alone", never "clear it". That is
        // why removing an image is `setImage`'s job and not something an
        // update body could ever express.
        let fullPatch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        var patch = fullPatch
        patch.removeValue(forKey: "ingredients")
        // The body's steps are `{text, imageUrl}` inputs, not `RecipeStep`s (no
        // id / sortOrder), so they can't be merged into the cached recipe as is.
        patch.removeValue(forKey: "steps")
        var updated = (try? JSONPatch.merged(Recipe.self, base: existing, patch: patch)) ?? existing
        // Ingredient edits apply to the local row in BOTH modes (in Local
        // mode there is no server to reconcile from; in Synced mode the
        // refresh replaces this with the resolved server shape). Macros
        // are recomputed from the local food store.
        if let inputs = update.ingredients {
            let ingredients = resolvedIngredients(inputs, recipeId: id)
            updated = Self.applying(ingredients: ingredients, to: updated)
        }
        // A present list replaces every step, exactly like the server does;
        // nil keeps the cached ones.
        if let inputs = update.steps {
            Self.evictLocalPhotos(of: existing.orderedSteps, keeping: inputs)
            updated.steps = Self.localSteps(from: inputs)
            updated.stepCount = inputs.count
        }
        row.update(from: updated)
        save()
        if LocalStore.isTempId(id) {
            // The queued create carries raw ingredient inputs, so it takes the
            // unfiltered patch.
            coalesceQueuedCreate(tempId: id) { body in
                (try? JSONPatch.merged(RecipeCreate.self, base: body, patch: fullPatch)) ?? body
            }
        } else {
            syncManager.enqueue(.updateRecipe(id: id, body: update))
        }
        return updated
    }

    /// Attaches or removes a recipe's image, as a partial PATCH — the food
    /// counterpart is `FoodRepository.setImage`, and the reasoning is the same:
    /// `RecipeUpdate` omits nil optionals, so a removal sent on a normal update
    /// body would never reach the server. The superseded image is dropped from
    /// the device, which for a Local-mode `file://` photo is the only copy
    /// there is.
    @discardableResult
    func setImage(id: String, imageUrl: String?) async throws -> Recipe {
        let id = TempIdMap.resolved(id)
        // NSNull, not a nil Optional: JSONSerialization rejects the latter, and
        // an omitted key would read as "leave the image alone" rather than
        // "remove it".
        let patch: [String: Any] = ["imageUrl": imageUrl.map { $0 as Any } ?? NSNull()]
        guard let row = fetchRow(id: id), let current = row.toRecipe(),
              let patched = try? JSONPatch.merged(Recipe.self, base: current, patch: patch)
        else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id) { body in
                (try? JSONPatch.merged(RecipeCreate.self, base: body, patch: patch)) ?? body
            }
        } else {
            syncManager.enqueue(.setRecipeImage(id: id, imageUrl: imageUrl))
        }
        if let previous = current.imageUrl, previous != imageUrl {
            LocalImageStore.evict(previous)
        }
        return patched
    }

    /// Replaces the recipe's labels — the English nouns search matches against,
    /// shared with foods. Optimistic like every other edit. Labels never ride
    /// on a recipe body, so a temp-id recipe gets its own queued op; the
    /// temp-id remap that follows the create's response points it at the
    /// server id before it is sent.
    @discardableResult
    func setLabels(id: String, labels: [String]) async throws -> Recipe {
        let id = TempIdMap.resolved(id)
        let normalized = LabelNormalizer.normalizeAll(labels).sorted()
        guard let row = fetchRow(id: id), let current = row.toRecipe(),
              let patched = try? JSONPatch.merged(Recipe.self, base: current, patch: ["labels": normalized])
        else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        syncManager.enqueue(.setRecipeLabels(id: id, labels: labels))
        return patched
    }

    /// Merges labeller-suggested labels into whatever the recipe already
    /// carries — additive like the server's `source: llm, mode: extend`
    /// write, so it never drops a label the user set by hand. Used by the
    /// "Suggest labels" button's merge-for-review step and by
    /// `FoodAutoLabeler`'s unattended sweep, same as `FoodRepository`'s.
    @discardableResult
    func addGeneratedLabels(id: String, labels: [String]) async throws -> Recipe {
        let id = TempIdMap.resolved(id)
        guard let row = fetchRow(id: id), let current = row.toRecipe() else {
            throw APIError.notFound
        }
        let suggested = LabelNormalizer.normalizeAll(labels)
        guard !suggested.isEmpty else { return current }
        let merged = LabelNormalizer.normalizeAll((current.labels ?? []) + suggested).sorted()
        guard let patched = try? JSONPatch.merged(Recipe.self, base: current, patch: ["labels": merged]) else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        syncManager.enqueue(.addGeneratedRecipeLabels(id: id, labels: suggested))
        return patched
    }

    /// Local recipes with no labels at all — part of the auto-label sweep's
    /// work list (`LabelUnlabeledFoodsView`) next to `unlabeledLocalFoods`.
    func unlabeledLocalRecipes() -> [Recipe] {
        let descriptor = FetchDescriptor<LocalRecipe>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.filter { $0.labels.isEmpty }.compactMap { $0.toRecipe() }
    }

    /// The names of a recipe's ingredient foods, in ingredient order, for the
    /// labeller. The server's recipe responses carry ingredient `foodId`s but
    /// no embedded food, so each name is looked up in the local food mirror;
    /// an ingredient whose food is not cached is left out.
    func ingredientFoodNames(of recipe: Recipe) -> [String] {
        (recipe.ingredients ?? [])
            .sorted { $0.sortOrder < $1.sortOrder }
            .compactMap { ingredient in
                (ingredient.food ?? localFood(id: TempIdMap.resolved(ingredient.foodId)))?.name
            }
    }

    func deleteRecipe(id: String) async throws {
        let id = TempIdMap.resolved(id)
        let doomed = recipe(id: id)
        LocalImageStore.evict(doomed?.imageUrl)
        Self.evictLocalPhotos(of: doomed?.orderedSteps ?? [], keeping: [])
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "recipes", affectedId: id)
        } else {
            syncManager.enqueue(.deleteRecipe(id: id, force: false))
        }
    }

    /// Asks first instead of deleting-then-hoping: `deleteRecipe` always deletes
    /// locally and queues the server delete, which — if the recipe still has diary
    /// entries — used to dead-letter on the resulting 409 and reappear on the next
    /// refresh, with no indication to the user why. In Local mode (or a not-yet-
    /// uploaded temp id) there is no server to ask, so diary entries referencing it
    /// are counted locally instead.
    func deleteRecipeChecked(id: String) async throws -> DeleteOutcome {
        let id = TempIdMap.resolved(id)
        if appMode.isLocal || LocalStore.isTempId(id) {
            let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.recipeId == id })
            let entryCount = (try? context.fetch(descriptor))?.count ?? 0
            if entryCount > 0 {
                return .blocked(DeleteConflict(entryCount: entryCount, ingredientCount: nil, recipeCount: nil))
            }
            try await deleteRecipe(id: id)
            return .deleted
        }
        do {
            try await api.deleteRecipe(id: id)
            let doomed = recipe(id: id)
            LocalImageStore.evict(doomed?.imageUrl)
            Self.evictLocalPhotos(of: doomed?.orderedSteps ?? [], keeping: [])
            deleteRow(id: id)
            save()
            syncManager.removeQueued(table: "recipes", affectedId: id)
            return .deleted
        } catch let error as APIError {
            if let conflict = error.deleteConflict {
                return .blocked(conflict)
            }
            // Not a conflict — likely offline/network. Fall back to the optimistic
            // path so the delete isn't lost; it'll be resolved (and surfaced if it
            // still conflicts) when the sync queue drains.
            try await deleteRecipe(id: id)
            return .deleted
        }
    }

    /// The diary entries that log this recipe, newest first, so a blocked delete
    /// can point the user at the entries to remove or change. Local mode (or a
    /// not-yet-uploaded temp id) has no server to ask and reads the local store.
    func whereUsed(id: String) async throws -> WhereUsed {
        let id = TempIdMap.resolved(id)
        if appMode.isLocal || LocalStore.isTempId(id) {
            let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.recipeId == id })
            let rows = (try? context.fetch(descriptor)) ?? []
            let entries = WhereUsed.sortedNewestFirst(rows.map(\.whereUsedEntry))
            return WhereUsed(entries: Array(entries.prefix(WhereUsed.entryLimit)), totalEntries: rows.count)
        }
        return try await api.getRecipeUsage(id: id)
    }

    /// Rewrites the still-queued create for a temp-id recipe so the eventual
    /// upload carries the edited values. If the create has already drained (no
    /// queued op found), the edit stays local-only.
    private func coalesceQueuedCreate(tempId: String, rewrite: (RecipeCreate) -> RecipeCreate) {
        for row in syncManager.queuedOperations(table: "recipes", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createRecipe(body, localId) = operation
            else { continue }
            syncManager.replace(row, with: .createRecipe(body: rewrite(body), localId: localId))
        }
    }

    // MARK: - Conversion helpers

    private func makeRecipe(from create: RecipeCreate, id: String) -> Recipe {
        let ingredients = resolvedIngredients(create.ingredients, recipeId: id)
        let macros = Self.recipeMacros(of: ingredients)
        // Always a list (never nil) so a fresh recipe reads as "steps known":
        // the editor only offers to change steps it has actually seen.
        let steps = Self.localSteps(from: create.steps ?? [])
        return Recipe(
            id: id,
            userId: "",
            name: create.name,
            totalServings: create.totalServings,
            isFavorite: create.isFavorite ?? false,
            imageUrl: create.imageUrl,
            calories: macros.calories,
            protein: macros.protein,
            carbs: macros.carbs,
            fat: macros.fat,
            fiber: macros.fiber,
            cookedWeight: create.cookedWeight,
            createdAt: DateFormatting.isoDateTimeString(from: Date()),
            updatedAt: nil,
            ingredients: ingredients,
            steps: steps,
            stepCount: steps.count
        )
    }

    /// Local rows for a steps list: array order becomes `sortOrder`, ids are
    /// temp ones (the server assigns real ids on the next detail refresh).
    static func localSteps(from inputs: [RecipeStepInput]) -> [RecipeStep] {
        inputs.enumerated().map { index, input in
            RecipeStep(id: LocalStore.makeTempId(), sortOrder: index, text: input.text, imageUrl: input.imageUrl)
        }
    }

    /// Removes the Local-mode `file://` photos of `steps` that `kept` no longer
    /// references. Server-hosted photos stay in the cache: the server decides
    /// when an upload is unreferenced, and the file may still serve another
    /// recipe's copy of the step.
    private static func evictLocalPhotos(of steps: [RecipeStep], keeping kept: [RecipeStepInput]) {
        let keptUrls = Set(kept.compactMap(\.imageUrl))
        for step in steps {
            guard let url = step.imageUrl, url.hasPrefix("file://"), !keptUrls.contains(url) else { continue }
            LocalImageStore.evict(url)
        }
    }

    private static func duplicatedStepPhoto(_ imageUrl: String?) -> String? {
        guard let imageUrl, imageUrl.hasPrefix("file://") else { return imageUrl }
        guard let photo = LocalImageStore.localPhoto(for: imageUrl) else { return nil }
        return LocalImageStore.writeLocalPhoto(
            photo.data, fileExtension: (photo.filename as NSString).pathExtension
        )
    }

    /// A list-endpoint copy carries neither `ingredients` nor `steps` (only
    /// `stepCount`), and must not wipe what a detail fetch cached: the list
    /// refresh runs on every launch and the detail may be opened offline
    /// afterwards (cooking mode needs both). The cached detail is only kept while
    /// `updatedAt` is unchanged: a newer stamp means the recipe was edited
    /// elsewhere, so the cached ingredients and steps are stale and go until the
    /// next detail refresh. Cached steps must also still match the count. A count
    /// of zero is itself an answer: no steps.
    static func preservingDetail(_ incoming: Recipe, existing: Recipe?) -> Recipe {
        var merged = incoming
        let unchanged = existing?.updatedAt == incoming.updatedAt
        if merged.ingredients == nil, unchanged {
            merged.ingredients = existing?.ingredients
        }
        guard incoming.steps == nil else { return merged }
        if incoming.stepCount == 0 {
            merged.steps = []
        } else if unchanged, let kept = existing?.steps, kept.count == incoming.stepCount {
            merged.steps = kept
        }
        return merged
    }

    /// Ingredient inputs resolved against the local food store.
    private func resolvedIngredients(_ inputs: [RecipeIngredientInput], recipeId: String) -> [RecipeIngredient] {
        inputs.enumerated().map { index, input in
            RecipeIngredient(
                id: nil,
                recipeId: recipeId,
                foodId: input.foodId,
                quantity: input.quantity,
                servingUnit: input.servingUnit,
                sortOrder: index,
                food: localFood(id: input.foodId)
            )
        }
    }

    /// Whole-recipe macro totals, replicating the server aggregation in
    /// `src/lib/server/recipes.ts`: each ingredient contributes
    /// `food.macro * convertedQuantity / food.servingSize`, where the ingredient's
    /// quantity is converted into the food's own unit (same dimension only —
    /// see `convertQuantityForMacros`); unresolved foods contribute nothing.
    /// Per-serving division happens at entry creation
    /// (`EntryRepository.makeEntry`), matching the server's entry shape.
    static func recipeMacros(
        of ingredients: [RecipeIngredient]
    ) -> (calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double) {
        var totals = (calories: 0.0, protein: 0.0, carbs: 0.0, fat: 0.0, fiber: 0.0)
        for ingredient in ingredients {
            guard let food = ingredient.food, food.servingSize > 0 else { continue }
            let convertedQuantity = convertQuantityForMacros(
                ingredient.quantity,
                from: ingredient.servingUnit,
                to: food.servingUnit
            )
            let factor = convertedQuantity / food.servingSize
            totals.calories += food.calories * factor
            totals.protein += food.protein * factor
            totals.carbs += food.carbs * factor
            totals.fat += food.fat * factor
            totals.fiber += food.fiber * factor
        }
        return totals
    }

    /// Copy of `recipe` with `ingredients` swapped in and macros recomputed.
    static func applying(ingredients: [RecipeIngredient], to recipe: Recipe) -> Recipe {
        let macros = recipeMacros(of: ingredients)
        var result = Recipe(
            id: recipe.id,
            userId: recipe.userId,
            name: recipe.name,
            totalServings: recipe.totalServings,
            isFavorite: recipe.isFavorite,
            imageUrl: recipe.imageUrl,
            calories: macros.calories,
            protein: macros.protein,
            carbs: macros.carbs,
            fat: macros.fat,
            fiber: macros.fiber,
            cookedWeight: recipe.cookedWeight,
            createdAt: recipe.createdAt,
            updatedAt: recipe.updatedAt,
            ingredients: ingredients
        )
        result.steps = recipe.steps
        result.stepCount = recipe.stepCount
        result.labels = recipe.labels
        return result
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalRecipe? {
        var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ recipe: Recipe) {
        if let row = fetchRow(id: recipe.id) {
            row.update(from: Self.preservingDetail(recipe, existing: row.toRecipe()))
        } else {
            context.insert(LocalRecipe(recipe: recipe))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func localFood(id: String) -> Food? {
        LocalRemap.foodRow(id: id, in: context)?.toFood()
    }

    private func save() {
        context.saveReportingFailure("RecipeRepository.save")
    }
}
