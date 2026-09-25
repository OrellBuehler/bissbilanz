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
        fetchRow(id: id)?.toRecipe()
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

    /// See `EntryRepository.updateEntry` — a missing local row is reported as a
    /// failure without also queueing an upload the caller was just told failed.
    @discardableResult
    func updateRecipe(id: String, _ update: RecipeUpdate) async throws -> Recipe {
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
        var updated = (try? JSONPatch.merged(Recipe.self, base: existing, patch: patch)) ?? existing
        // Ingredient edits apply to the local row in BOTH modes (in Local
        // mode there is no server to reconcile from; in Synced mode the
        // refresh replaces this with the resolved server shape). Macros
        // are recomputed from the local food store.
        if let inputs = update.ingredients {
            let ingredients = resolvedIngredients(inputs, recipeId: id)
            updated = Self.applying(ingredients: ingredients, to: updated)
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

    func deleteRecipe(id: String) async throws {
        LocalImageStore.evict(recipe(id: id)?.imageUrl)
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
            LocalImageStore.evict(recipe(id: id)?.imageUrl)
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

    /// Deletes a recipe the user already confirmed via a `DeleteOutcome.blocked` prompt.
    func forceDeleteRecipe(id: String) async throws {
        if appMode.isLocal || LocalStore.isTempId(id) {
            try await deleteRecipe(id: id)
            return
        }
        let imageUrl = recipe(id: id)?.imageUrl
        deleteRow(id: id)
        save()
        do {
            try await api.deleteRecipe(id: id, force: true)
            syncManager.removeQueued(table: "recipes", affectedId: id)
        } catch {
            if error is CancellationError { throw error }
            // Offline or a transient failure — queue the forced delete so the
            // user's confirmed choice still lands once connectivity returns.
            syncManager.enqueue(.deleteRecipe(id: id, force: true))
        }
        if let imageUrl { LocalImageStore.evict(imageUrl) }
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
            createdAt: DateFormatting.isoDateTimeString(from: Date()),
            updatedAt: nil,
            ingredients: ingredients
        )
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
    private static func applying(ingredients: [RecipeIngredient], to recipe: Recipe) -> Recipe {
        let macros = recipeMacros(of: ingredients)
        return Recipe(
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
            createdAt: recipe.createdAt,
            updatedAt: recipe.updatedAt,
            ingredients: ingredients
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalRecipe? {
        var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ recipe: Recipe) {
        if let row = fetchRow(id: recipe.id) {
            row.update(from: recipe)
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
        try? context.save()
    }
}
