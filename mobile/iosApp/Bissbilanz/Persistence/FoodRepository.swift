import Foundation
import Observation
import SwiftData

/// Local-first repository for the personal food database.
///
/// Favorites, recents and detail reads come from SwiftData; search stays
/// API-first (the server searches the full DB) with a local fallback. Writes
/// are SwiftData-first with the upload queued via the sync manager: the
/// drained create replaces the optimistic `temp_` row with the server record,
/// and edits/deletes of a still-queued temp row coalesce with the queued
/// create. In Local mode nothing is queued and refreshes/search are
/// local-only — the store is the primary database.
@MainActor
@Observable
final class FoodRepository {
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

    func food(id: String) -> Food? {
        fetchRow(id: id)?.toFood()
    }

    func favorites() -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toFood() }
    }

    /// Recents derived from the local entry log — instant render across
    /// launches; `refreshRecentFoods` replaces this with the server ordering.
    func localRecentFoods(limit: Int = 20) -> [Food] {
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.foodId != nil })
        let entryRows = (try? context.fetch(descriptor)) ?? []
        var lastDateByFood: [String: String] = [:]
        for row in entryRows {
            guard let foodId = row.foodId else { continue }
            if let current = lastDateByFood[foodId], current >= row.date { continue }
            lastDateByFood[foodId] = row.date
        }
        return lastDateByFood
            .sorted { $0.value > $1.value }
            .prefix(limit)
            .compactMap { food(id: $0.key) }
    }

    /// Alphabetical slice of the whole local catalog — the last-resort pool
    /// for intent suggestions when favorites and recents are both empty.
    func localFoods(limit: Int = 50) -> [Food] {
        var descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        descriptor.fetchLimit = limit
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toFood() }
    }

    /// Rank name matches ahead of brand-only matches; both stay alphabetical.
    ///
    /// One pass, with each row's comparisons evaluated once. The previous shape
    /// filtered the table, then re-filtered the matches twice more to split the
    /// two groups — up to four ICU comparisons per row. This backs offline
    /// search, Local-mode search, and the on-device meal estimator's
    /// `searchLocalFoods` tool, which calls it once per item while the model
    /// waits. Rows arrive alphabetical and name matches rank first, so once
    /// `limit` of them are found the rest of the table can't change the result.
    func searchLocal(_ query: String, limit: Int = 50) -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        var nameMatches: [LocalFood] = []
        var brandOnly: [LocalFood] = []
        for row in rows {
            if row.name.localizedCaseInsensitiveContains(query) {
                nameMatches.append(row)
                if nameMatches.count == limit { break }
            } else if brandOnly.count < limit,
                      row.brand?.localizedCaseInsensitiveContains(query) == true
            {
                brandOnly.append(row)
            }
        }
        return (nameMatches + brandOnly)
            .prefix(limit)
            .compactMap { $0.toFood() }
    }

    func findLocalByBarcode(_ barcode: String) -> Food? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.barcode == barcode })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toFood()
    }

    // MARK: - Refresh (API → store)

    func refreshFood(id: String) async throws {
        guard !appMode.isLocal, !LocalStore.isTempId(id) else { return }
        let food = try await api.getFood(id: id)
        guard !syncManager.pendingAffectedIds(table: "foods").contains(id) else { return }
        upsert(food)
        save()
    }

    /// Refreshes favorites and reconciles un-favorited rows. Also caches the
    /// favorite recipes carried in the same response.
    func refreshFavorites() async throws {
        guard !appMode.isLocal else { return }
        let response = try await api.getFavorites()
        let favoriteIds = Set(response.foods.map(\.id))
        // Rows with an un-uploaded queued write must survive the server
        // response: a refresh racing the sync-queue upload would otherwise
        // reapply the stale server copy over the user's edit (see
        // EntryRepository.refresh, PR #416).
        let pendingFoodIds = syncManager.pendingAffectedIds(table: "foods")
        let pendingRecipeIds = syncManager.pendingAffectedIds(table: "recipes")
        for stale in favorites() where !favoriteIds.contains(stale.id)
            && !LocalStore.isTempId(stale.id) && !pendingFoodIds.contains(stale.id)
        {
            if let row = fetchRow(id: stale.id), let patched = patchedFavorite(stale, isFavorite: false) {
                row.update(from: patched)
            }
        }
        for food in response.foods where !pendingFoodIds.contains(food.id) {
            upsert(food)
        }
        for recipe in response.recipes ?? [] where !pendingRecipeIds.contains(recipe.id) {
            LocalRemap.upsertRecipe(recipe, in: context)
        }
        save()
    }

    /// Caches the user's whole food database, page by page.
    ///
    /// Foods are otherwise cached opportunistically — favorites, recents, search
    /// hits, scanned barcodes — which is enough to log with but not to analyse
    /// with: resolving a 90-day window's extended nutrients (sodium, caffeine,
    /// omega-3/6, NOVA group…) needs the food behind every entry, including ones
    /// logged months ago and never opened since.
    ///
    /// Paging stops on the first short page. Rows with an un-uploaded queued
    /// write are skipped, as everywhere else.
    func mirrorAll(pageSize: Int = 200, maxPages: Int = 50) async throws {
        guard !appMode.isLocal else { return }
        let pendingIds = syncManager.pendingAffectedIds(table: "foods")
        for page in 0 ..< maxPages {
            let foods = try await api.getFoods(limit: pageSize, offset: page * pageSize)
            for food in foods where !pendingIds.contains(food.id) {
                upsert(food)
            }
            save()
            if foods.count < pageSize { return }
        }
    }

    /// Server-ordered recents (trimmed foods, not cached — mirrors Android);
    /// falls back to the locally derived list offline and in Local mode.
    func refreshRecentFoods(limit: Int = 20) async -> [Food] {
        if !appMode.isLocal, let recents = try? await api.getRecentFoods(limit: limit) {
            return recents
        }
        return localRecentFoods(limit: limit)
    }

    /// API-first search over the full server-side food DB; results are cached
    /// and the local store answers offline and in Local mode.
    func searchFoods(query: String) async -> [Food] {
        guard !appMode.isLocal else { return searchLocal(query) }
        do {
            let results = try await api.searchFoods(query: query)
            let pendingIds = syncManager.pendingAffectedIds(table: "foods")
            for food in results where !pendingIds.contains(food.id) {
                upsert(food)
            }
            save()
            return results
        } catch {
            return searchLocal(query)
        }
    }

    func findByBarcode(_ barcode: String) async throws -> Food? {
        if let local = findLocalByBarcode(barcode) {
            return local
        }
        guard !appMode.isLocal else { return nil }
        guard let food = try await api.findFoodByBarcode(barcode) else { return nil }
        upsert(food)
        save()
        return food
    }

    // MARK: - Writes (local first + queued upload)

    @discardableResult
    func createFood(_ create: FoodCreate) async throws -> Food {
        let temp = try Self.makeFood(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createFood(body: create, localId: temp.id))
        return temp
    }

    @discardableResult
    func updateFood(id: String, _ create: FoodCreate) async throws -> Food {
        // Merge-patch the form fields onto the existing row: the edit form
        // only carries the basic fields, so rebuilding the row wholesale
        // would wipe extended nutrients and OFF metadata (nutriScore,
        // additives, imageUrl, …) of e.g. a scanned food.
        let patch = (try? JSONPatch.dictionary(of: create)) ?? [:]
        let optimistic: Food = if let existing = food(id: id),
                                  let merged = try? JSONPatch.merged(Food.self, base: existing, patch: patch)
        {
            merged
        } else {
            try Self.makeFood(from: create, id: id)
        }
        upsert(optimistic)
        save()
        if LocalStore.isTempId(id) {
            // Not uploaded yet — merge the edit into the queued create body
            // (replacing it wholesale would strip fields the form doesn't
            // carry from the eventual upload too).
            coalesceQueuedCreate(tempId: id) { body in
                (try? JSONPatch.merged(FoodCreate.self, base: body, patch: patch)) ?? body
            }
        } else {
            syncManager.enqueue(.updateFood(id: id, body: create))
        }
        return optimistic
    }

    /// Attaches or removes a food's image, as a partial PATCH — same reasoning
    /// as `toggleFavorite`: the edit form's `FoodCreate` omits nil optionals,
    /// so a removal sent through it would never reach the server. The
    /// superseded image is dropped from the device, which for a Local-mode
    /// `file://` photo is the only copy there is.
    @discardableResult
    func setImage(id: String, imageUrl: String?) async throws -> Food {
        // NSNull, not a nil Optional: JSONSerialization rejects the latter, and
        // an omitted key would read as "leave the image alone" rather than
        // "remove it".
        let patch: [String: Any] = ["imageUrl": imageUrl.map { $0 as Any } ?? NSNull()]
        guard let row = fetchRow(id: id), let current = row.toFood(),
              let patched = try? JSONPatch.merged(Food.self, base: current, patch: patch)
        else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id) { body in
                (try? JSONPatch.merged(FoodCreate.self, base: body, patch: patch)) ?? body
            }
        } else {
            syncManager.enqueue(.setFoodImage(id: id, imageUrl: imageUrl))
        }
        if let previous = current.imageUrl, previous != imageUrl {
            LocalImageStore.evict(previous)
        }
        return patched
    }

    func deleteFood(id: String) async throws {
        LocalImageStore.evict(food(id: id)?.imageUrl)
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "foods", affectedId: id)
        } else {
            syncManager.enqueue(.deleteFood(id: id))
        }
    }

    @discardableResult
    func toggleFavorite(foodId: String, isFavorite: Bool) async throws -> Food {
        guard let row = fetchRow(id: foodId), let current = row.toFood(),
              let patched = patchedFavorite(current, isFavorite: isFavorite)
        else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        if LocalStore.isTempId(foodId) {
            coalesceQueuedCreate(tempId: foodId) { body in
                (try? JSONPatch.merged(FoodCreate.self, base: body, patch: ["isFavorite": isFavorite])) ?? body
            }
        } else {
            syncManager.enqueue(.toggleFavorite(id: foodId, isFavorite: isFavorite))
        }
        return patched
    }

    /// Rewrites the still-queued create for a temp-id food. If the create has
    /// already drained (no queued op found), the edit stays local-only.
    private func coalesceQueuedCreate(tempId: String, rewrite: (FoodCreate) -> FoodCreate) {
        for row in syncManager.queuedOperations(table: "foods", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createFood(body, localId) = operation
            else { continue }
            syncManager.replace(row, with: .createFood(body: rewrite(body), localId: localId))
        }
    }

    // MARK: - Conversion helpers

    static func makeFood(from create: FoodCreate, id: String) throws -> Food {
        try JSONPatch.merged(Food.self, base: create, patch: [
            "id": id,
            "userId": "",
            "isFavorite": create.isFavorite ?? false,
        ])
    }

    private func patchedFavorite(_ food: Food, isFavorite: Bool) -> Food? {
        try? JSONPatch.merged(Food.self, base: food, patch: ["isFavorite": isFavorite])
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalFood? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ food: Food) {
        if let row = fetchRow(id: food.id) {
            row.update(from: food)
        } else {
            context.insert(LocalFood(food: food))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func save() {
        try? context.save()
        WidgetSnapshotWriter.scheduleUpdate(context: context)
    }
}
