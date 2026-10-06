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
    private let defaults: UserDefaults

    init(
        context: ModelContext,
        api: BissbilanzAPI,
        appMode: AppModeManager,
        syncManager: SyncManager,
        defaults: UserDefaults = .standard
    ) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
        self.defaults = defaults
    }

    // MARK: - Reads (local)

    func food(id: String) -> Food? {
        fetchRow(id: TempIdMap.resolved(id))?.toFood()
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

    /// The whole local catalog, unlimited — used for the periodic full
    /// Spotlight reindex (`BissbilanzApp.runDeferredActivationWork`) and the
    /// iOS 27 full-reindex hook, where every food has to be searchable, not
    /// just the last-resort suggestion pool `localFoods` serves.
    func allLocalFoods() -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toFood() }
    }

    /// The foods worth putting in Spotlight: favorites, then recents, then the
    /// alphabetical head of the catalog, capped at `limit`. Indexing every row
    /// of a 100k-food catalog means 100k attribute sets and an unbounded array
    /// of entities in memory, for a system search nobody scrolls that far in.
    func spotlightFoods(limit: Int = 5000) -> [Food] {
        guard limit > 0 else { return [] }
        var seen = Set<String>()
        var result: [Food] = []
        let candidates = favorites() + localRecentFoods(limit: 200) + localFoods(limit: limit)
        for food in candidates where result.count < limit {
            if seen.insert(food.id).inserted {
                result.append(food)
            }
        }
        return result
    }

    /// Visual Intelligence supplies general English nouns, not a text search.
    /// Match only stored labels so names/brands cannot introduce unrelated hits.
    ///
    /// Both sides are expanded to a *term set* — a label plus each of its
    /// individual words, normalized the same way — before comparing: a food
    /// labelled "banana bread" then still surfaces for a lone "bread"
    /// descriptor, and a two-word "banana bread" descriptor still finds a food
    /// labelled only "bread". The score is the number of distinct terms the
    /// two sets share; only foods with at least one shared term are returned,
    /// ranked by that score first, then favorite, then name, then id.
    /// Local-only even in Synced mode: system queries must return promptly
    /// offline.
    func foods(matchingLabels labels: [String], limit: Int = 10) -> [Food] {
        guard limit > 0 else { return [] }
        let normalizedLabels = LabelNormalizer.normalizeAll(labels)
        let queryTerms = Self.termSet(forLabels: normalizedLabels)
        guard !queryTerms.isEmpty else { return [] }

        let descriptor = FetchDescriptor<LocalFood>(sortBy: [
            SortDescriptor(\.name),
            SortDescriptor(\.id),
        ])
        let rows = (try? context.fetch(descriptor)) ?? []

        let scored: [(food: Food, score: Int, row: LocalFood)] = rows.compactMap { row in
            let overlap = queryTerms.intersection(Self.termSet(forLabels: row.labels)).count
            guard overlap > 0, let food = row.toFood() else { return nil }
            return (food, overlap, row)
        }
        let ranked = scored.sorted { lhs, rhs in
            if lhs.score != rhs.score { return lhs.score > rhs.score }
            if lhs.row.isFavorite != rhs.row.isFavorite { return lhs.row.isFavorite }
            if lhs.row.name != rhs.row.name { return lhs.row.name < rhs.row.name }
            return lhs.row.id < rhs.row.id
        }
        return ranked.prefix(limit).map(\.food)
    }

    /// A label plus its individual words, each independently normalized —
    /// used by `foods(matchingLabels:limit:)` to compare a descriptor's labels
    /// against a food's stored ones term-by-term rather than whole label by
    /// whole label. Labels are already normalized by the caller, so splitting
    /// on the space `normalize` itself would have collapsed onto is safe.
    private static func termSet(forLabels labels: [String]) -> Set<String> {
        var terms = Set<String>()
        for label in labels {
            terms.insert(label)
            let words = label.split(separator: " ").map(String.init)
            guard words.count > 1 else { continue }
            for word in words {
                if let normalizedWord = LabelNormalizer.normalize(word) {
                    terms.insert(normalizedWord)
                }
            }
        }
        return terms
    }

    /// Local foods with no labels at all — the auto-label sweep's work list
    /// and the Settings row's count (`LabelUnlabeledFoodsView`).
    func unlabeledLocalFoods() -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.filter { $0.labels.isEmpty }.compactMap { $0.toFood() }
    }

    /// Local foods with a barcode that still lack a Nutri-Score, NOVA group or
    /// ingredients text — never enriched, or only partly. The "Enhance Foods"
    /// sweep's work list and the Settings row's count (`EnhanceFoodsView`).
    func unenrichedLocalFoods() -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toFood() }.filter(Self.needsEnrichment)
    }

    static func needsEnrichment(_ food: Food) -> Bool {
        guard let barcode = food.barcode?.trimmingCharacters(in: .whitespaces), !barcode.isEmpty else {
            return false
        }
        let noIngredients = food.ingredientsText?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true
        return food.nutriScore == nil || food.novaGroup == nil || noIngredients
    }

    /// The most-used labels already in the local catalog, most-common first —
    /// handed to `FoodLabeler` so it reuses existing vocabulary instead of
    /// inventing near-synonyms, mirroring the MCP `label_foods` prompt's
    /// `list_labels` step.
    func mostUsedLocalLabels(limit: Int = 60) -> [String] {
        let rows = (try? context.fetch(FetchDescriptor<LocalFood>())) ?? []
        var counts: [String: Int] = [:]
        for row in rows {
            for label in row.labels { counts[label, default: 0] += 1 }
        }
        return counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
            .prefix(limit)
            .map(\.key)
    }

    /// Rank name matches ahead of label matches ahead of brand-only matches;
    /// each tier stays alphabetical. Same tiers as the server's search: name,
    /// then English label, then brand. The query is folded exactly like a
    /// stored label, so "Breads" meets a food labelled "bread" whatever
    /// language its name is in.
    ///
    /// Backs offline search, Local-mode search, and the on-device meal
    /// estimator's `searchLocalFoods` tool (once per item while the model
    /// waits), so it must stay cheap on a catalog of 100k foods: the name and
    /// brand tiers are `fetchLimit`-bounded predicate fetches, and the label
    /// tier — a predicate cannot reach into `labels` — only runs when the name
    /// tier left room, over just the id and labels columns.
    func searchLocal(_ query: String, limit: Int = 50) -> [Food] {
        guard limit > 0, !query.isEmpty else { return [] }
        var nameDescriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate { $0.name.localizedStandardContains(query) },
            sortBy: [SortDescriptor(\.name)]
        )
        nameDescriptor.fetchLimit = limit
        var rows = fetchRows(nameDescriptor)
        if rows.count < limit, let label = LabelNormalizer.normalize(query) {
            let matched = Set(rows.map(\.id))
            let labelIds = labelMatchIds(label, excluding: matched, limit: limit - rows.count)
            rows += fetchRows(FetchDescriptor<LocalFood>(
                predicate: #Predicate { labelIds.contains($0.id) },
                sortBy: [SortDescriptor(\.name)]
            ))
        }
        if rows.count < limit {
            var brandDescriptor = FetchDescriptor<LocalFood>(
                predicate: #Predicate {
                    !$0.name.localizedStandardContains(query) && $0.brand?.localizedStandardContains(query) == true
                },
                sortBy: [SortDescriptor(\.name)]
            )
            brandDescriptor.fetchLimit = limit
            let labeled = Set(rows.map(\.id))
            rows += fetchRows(brandDescriptor).filter { !labeled.contains($0.id) }
        }
        return rows.prefix(limit).compactMap { $0.toFood() }
    }

    private func labelMatchIds(_ label: String, excluding: Set<String>, limit: Int) -> [String] {
        var descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        descriptor.propertiesToFetch = [\.id, \.labels]
        var ids: [String] = []
        for row in fetchRows(descriptor) where row.labels.contains(label) && !excluding.contains(row.id) {
            ids.append(row.id)
            if ids.count == limit { break }
        }
        return ids
    }

    private func fetchRows(_ descriptor: FetchDescriptor<LocalFood>) -> [LocalFood] {
        do {
            return try context.fetch(descriptor)
        } catch {
            ErrorReporter.capture(error, context: ["operation": "FoodRepository.fetchRows"])
            return []
        }
    }

    func findLocalByBarcode(_ barcode: String) -> Food? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.barcode == barcode })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toFood()
    }

    // MARK: - Refresh (API → store)

    /// Also prunes the local row when the server no longer has it (deleted, or
    /// merged into another food via `mergeFoods` server-side — which re-points
    /// entries that already existed server-side but not a still-queued
    /// offline create, see `SyncManager.onFoodReferenceMissing`). Without this
    /// the same stale food keeps surfacing in search/recents/favorites.
    func refreshFood(id: String) async throws {
        let id = TempIdMap.resolved(id)
        guard !appMode.isLocal, !LocalStore.isTempId(id) else { return }
        do {
            let food = try await api.getFood(id: id)
            guard !syncManager.pendingAffectedIds(table: "foods").contains(id) else { return }
            upsert(food)
            save()
        } catch let error as APIError where Self.isMissing(error) {
            // An imported food still waiting for its bulk upload is not on the server yet.
            if !syncManager.pendingAffectedIds(table: "foods").contains(id), try !hasBulkUploadJob(foodId: id) {
                deleteRow(id: id)
                save()
            }
            throw error
        }
    }

    private static func isMissing(_ error: APIError) -> Bool {
        switch error {
        case .notFound, .gone: true
        default: false
        }
    }

    /// Refreshes favorites and reconciles un-favorited rows. Also caches the
    /// favorite recipes carried in the same response.
    func refreshFavorites() async throws {
        guard !appMode.isLocal else { return }
        let response = try await api.getFavorites()
        let favoriteIds = Set((response.foods ?? []).map(\.id))
        // Rows with an un-uploaded queued write must survive the server
        // response: a refresh racing the sync-queue upload would otherwise
        // reapply the stale server copy over the user's edit (see
        // EntryRepository.refresh, PR #416).
        let pendingFoodIds = syncManager.pendingAffectedIds(table: "foods")
        let pendingRecipeIds = syncManager.pendingAffectedIds(table: "recipes")
        for stale in favorites() where !favoriteIds.contains(stale.id) && !pendingFoodIds.contains(stale.id) {
            if let row = fetchRow(id: stale.id), let patched = patchedFavorite(stale, isFavorite: false) {
                row.update(from: patched)
            }
        }
        for food in response.foods ?? [] where !pendingFoodIds.contains(food.id) {
            upsert(food)
        }
        for recipe in response.recipes ?? [] where !pendingRecipeIds.contains(recipe.id) {
            LocalRemap.upsertRecipe(recipe, in: context)
        }
        save()
    }

    /// Mirrors the user's whole food database into the local store, as a delta.
    ///
    /// Foods are otherwise cached opportunistically — favorites, recents, search
    /// hits, scanned barcodes — which is enough to log with but not to analyse
    /// with: resolving a 90-day window's extended nutrients (sodium, caffeine,
    /// omega-3/6, NOVA group…) needs the food behind every entry, including ones
    /// logged months ago and never opened since.
    ///
    /// The server lists foods ordered by `(serverModifiedAt, id)`, so a sync only
    /// asks for rows written since the stored checkpoint (the newest
    /// `serverModifiedAt` seen, minus `checkpointOverlap` to absorb clock skew
    /// and in-flight transactions) and pages through them with the opaque
    /// `nextCursor`. A fresh store starts from the epoch. The checkpoint is
    /// persisted after every page, so an interrupted first sync of a very large
    /// catalog resumes where it stopped; upserts are idempotent, so the overlap
    /// is harmless.
    ///
    /// Deletions are not in a delta, so a mirror that ran to the end also
    /// reconciles ids (`pruneMissing`) — when none has been done yet and then
    /// once per `pruneInterval`, or whenever `reconcileDeletions` asks. A
    /// mirror cut short by an error or by `maxPages` prunes nothing: a partial
    /// listing is not grounds for deleting rows it simply didn't get to yet.
    /// Rows with an un-uploaded queued write are skipped on upsert and kept on
    /// prune, as everywhere else.
    func mirrorAll(pageSize: Int = 1000, maxPages: Int = 1000, reconcileDeletions: Bool = false) async throws {
        guard !appMode.isLocal else { return }
        let storedCheckpoint = defaults.double(forKey: FoodMirrorState.checkpointKey)
        let hasLocalRows = ((try? context.fetchCount(FetchDescriptor<LocalFood>())) ?? 0) > 0
        // A store emptied since the checkpoint was written (sign-out, wipe) has
        // nothing to be incremental over.
        let checkpoint = storedCheckpoint > 0 && hasLocalRows
            ? Date(timeIntervalSince1970: storedCheckpoint)
            : nil
        let since = checkpoint.map { $0.addingTimeInterval(-Self.checkpointOverlap) }
            ?? Date(timeIntervalSince1970: 0)
        let modifiedSince = DateFormatting.isoDateTimeString(from: since)

        var newest = checkpoint
        var cursor: String?
        var completed = false
        for _ in 0 ..< maxPages {
            let page = try await api.getFoodsDelta(
                modifiedSince: cursor == nil ? modifiedSince : nil,
                after: cursor,
                limit: pageSize
            )
            let pendingIds = syncManager.pendingAffectedIds(table: "foods")
            upsertAll(page.foods.filter { !pendingIds.contains($0.id) })
            context.saveReportingFailure("FoodRepository.mirrorAll")
            for food in page.foods {
                guard let stamp = food.serverModifiedAt.flatMap(DateFormatting.isoDateTime(from:)) else { continue }
                if newest.map({ stamp > $0 }) ?? true { newest = stamp }
            }
            if let newest {
                defaults.set(newest.timeIntervalSince1970, forKey: FoodMirrorState.checkpointKey)
            }
            guard let next = page.nextCursor, !page.foods.isEmpty else {
                completed = true
                break
            }
            cursor = next
        }
        WidgetSnapshotWriter.scheduleUpdate(context: context)
        if completed, reconcileDeletions || pruneDue() {
            try await pruneMissing()
        }
    }

    private static let checkpointOverlap: TimeInterval = 60
    private static let pruneInterval: TimeInterval = 24 * 60 * 60

    private func pruneDue() -> Bool {
        let last = defaults.double(forKey: FoodMirrorState.prunedAtKey)
        return last <= 0 || Date().timeIntervalSince1970 - last >= Self.pruneInterval
    }

    /// Inserts or updates a page of foods with one id lookup per chunk — a
    /// per-food `fetchRow` would scan the whole table once per row, which is
    /// quadratic across a 100k-food first sync.
    private func upsertAll(_ foods: [Food]) {
        for chunk in foods.chunked(into: 500) {
            let ids = chunk.map(\.id)
            let existing = (try? context.fetch(FetchDescriptor<LocalFood>(
                predicate: #Predicate { ids.contains($0.id) }
            ))) ?? []
            var rowsById: [String: LocalFood] = [:]
            for row in existing where rowsById[row.id] == nil {
                rowsById[row.id] = row
            }
            for food in chunk {
                if let row = rowsById[food.id] {
                    row.update(from: food)
                } else {
                    context.insert(LocalFood(food: food))
                }
            }
        }
    }

    /// Deletes local food rows the server no longer has — deleted, or merged
    /// away via `mergeFoods` — judged by comparing ids (`GET /api/foods/ids`),
    /// since a delta listing cannot express a hard delete. Ids compare
    /// case-insensitively: the server's are lowercase UUIDs. Only rows that
    /// were already local before the request went out are candidates (one
    /// created or drained while it was in flight is not in the response yet),
    /// and rows with a queued write, or a `temp_` id awaiting its create, stay — as do
    /// imported foods whose bulk upload is not done, which the server has never heard of.
    private func pruneMissing() async throws {
        let before = localFoodIds()
        let serverIds = Set(try await api.getFoodIds().map { $0.lowercased() })
        var pendingIds = Set(syncManager.pendingAffectedIds(table: "foods").map { $0.lowercased() })
        pendingIds.formUnion(try bulkUploadFoodIds())
        let orphans = before.filter { id in
            let folded = id.lowercased()
            return !LocalStore.isTempId(id) && !serverIds.contains(folded) && !pendingIds.contains(folded)
        }
        for chunk in orphans.chunked(into: 500) {
            let rows = (try? context.fetch(FetchDescriptor<LocalFood>(
                predicate: #Predicate { chunk.contains($0.id) }
            ))) ?? []
            for row in rows {
                context.delete(row)
            }
        }
        save()
        defaults.set(Date().timeIntervalSince1970, forKey: FoodMirrorState.prunedAtKey)
    }

    /// Foods an import handed to the bulk upload and the server has not confirmed (pending or
    /// parked), lowercased. A read that fails throws: guessing "none" would let a prune delete them.
    private func bulkUploadFoodIds() throws -> Set<String> {
        var descriptor = FetchDescriptor<BulkUploadJob>()
        descriptor.propertiesToFetch = [\.foodId]
        return Set(try context.fetch(descriptor).map { $0.foodId.lowercased() })
    }

    private func hasBulkUploadJob(foodId: String) throws -> Bool {
        try context.fetchCount(FetchDescriptor<BulkUploadJob>(predicate: #Predicate { $0.foodId == foodId })) > 0
    }

    private func localFoodIds() -> [String] {
        var descriptor = FetchDescriptor<LocalFood>()
        descriptor.propertiesToFetch = [\.id]
        return fetchRows(descriptor).map(\.id)
    }

    /// One alphabetical page of the catalog for the Foods tab's "All" list, so
    /// a database of thousands of foods is never held in memory at once.
    /// Server pages are cached like a search; Local mode and offline page
    /// through the local store instead.
    func foodsPage(limit: Int, offset: Int) async -> [Food] {
        if !appMode.isLocal, let page = try? await api.getFoods(limit: limit, offset: offset) {
            let pendingIds = syncManager.pendingAffectedIds(table: "foods")
            for food in page where !pendingIds.contains(food.id) {
                upsert(food)
            }
            save()
            return page
        }
        var descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        descriptor.fetchLimit = limit
        descriptor.fetchOffset = offset
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toFood() }
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
            ErrorReporter.captureWarning("Food search failed, falling back to local", context: ["reason": ErrorReporter.reason(for: error)])
            return searchLocal(query)
        }
    }

    /// Free-text Open Food Facts search, the fallback when the user's own
    /// database has few matches. Never throws: OFF being down must not break
    /// the local search that already succeeded. Local mode queries OFF
    /// directly; Synced mode goes through the authenticated proxy.
    func searchOpenFoodFacts(query: String) async -> [BissbilanzAPI.OpenFoodFactsSearchHit] {
        do {
            if appMode.isLocal {
                return try await OpenFoodFactsClient().searchProducts(query: query).compactMap { food in
                    guard let barcode = food.barcode, !barcode.isEmpty else { return nil }
                    return BissbilanzAPI.OpenFoodFactsSearchHit(
                        barcode: barcode,
                        name: food.name,
                        brand: food.brand,
                        imageUrl: food.imageUrl,
                        calories: food.calories,
                        protein: food.protein,
                        carbs: food.carbs,
                        fat: food.fat
                    )
                }
            }
            return try await api.searchOpenFoodFacts(query: query)
        } catch {
            ErrorReporter.captureWarning("Open Food Facts search failed", context: ["reason": ErrorReporter.reason(for: error)])
            return []
        }
    }

    /// Copy-on-use for an Open Food Facts search hit: the user's own food with
    /// that barcode if one exists, else a new food created from the OFF
    /// product (mirroring the barcode scanner). Nil when OFF no longer knows
    /// the barcode.
    func findOrCreateFromOpenFoodFacts(barcode: String) async throws -> Food? {
        if let existing = try await findByBarcode(barcode) {
            return existing
        }
        let hit: BissbilanzAPI.OpenFoodFactsHit? = if appMode.isLocal {
            try await OpenFoodFactsClient().lookupBarcode(barcode)
                .map { BissbilanzAPI.OpenFoodFactsHit(food: $0, categoriesTags: nil) }
        } else {
            try await api.lookupBarcode(barcode)
        }
        guard let hit else { return nil }
        let food = hit.food
        return try await createFood(FoodCreate(
            name: food.name,
            brand: food.brand,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            barcode: barcode,
            nutriScore: food.nutriScore,
            novaGroup: food.novaGroup,
            additives: food.additives,
            ingredientsText: food.ingredientsText,
            categoriesTags: hit.categoriesTags
        ))
    }

    /// Re-reads the food's barcode in Open Food Facts and overlays the product's
    /// detail — extended nutrients, NutriScore, NOVA, additives, ingredients,
    /// image, category tags — onto the stored food, mirroring Android's
    /// `FoodRepository.enrichFood`. Identity and core macros stay the user's:
    /// they already committed to those values. There is no enrich endpoint —
    /// it is the Open Food Facts lookup plus an ordinary food update, so it
    /// goes through the same optimistic write and sync queue as any edit.
    @discardableResult
    func enrichFood(id: String, barcode: String) async throws -> Food {
        let id = TempIdMap.resolved(id)
        guard let current = food(id: id) else { throw APIError.notFound }
        let hit: BissbilanzAPI.OpenFoodFactsHit
        if appMode.isLocal {
            guard let product = try await OpenFoodFactsClient().lookupBarcode(barcode) else {
                throw APIError.notFound
            }
            hit = BissbilanzAPI.OpenFoodFactsHit(food: product, categoriesTags: nil)
        } else {
            // The throwing lookup keeps a rate limit or network failure
            // distinguishable from "no such product" for the bulk sweep.
            hit = try await api.lookupBarcodeOrThrow(barcode)
        }
        return try await updateFood(id: id, Self.enrichmentPayload(baseline: current, hit: hit))
    }

    /// Baseline overlaid with the product, then the identity and core macro
    /// fields forced back to the baseline. The product `Food` only encodes the
    /// keys Open Food Facts actually returned (nil optionals are dropped), so
    /// everything it doesn't know keeps the stored value — the `product.x ?:
    /// baseline.x` rule of the shared Kotlin `mergeOpenFoodFactsOntoFood`.
    static func enrichmentPayload(baseline: Food, hit: BissbilanzAPI.OpenFoodFactsHit) throws -> FoodCreate {
        let baselineFields = try JSONPatch.dictionary(of: baseline)
        let productFields = try JSONPatch.dictionary(of: hit.food)
        var merged = baselineFields.merging(productFields) { _, new in new }
        for key in userOwnedFoodKeys {
            // A nil assignment removes the key, which leaves the stored value
            // untouched on a partial PATCH — the same outcome as sending it.
            merged[key] = baselineFields[key]
        }
        // The stored image is destructive to replace: `updateFood` on the
        // server unlinks the previous `imageUrl` from disk once the write
        // lands, so overwriting a photo the user took of this food deletes it
        // irreversibly (in Local mode the `file://` copy is merely orphaned).
        // Take the Open Food Facts product shot only when there is no image.
        if let storedImage = baselineFields["imageUrl"] {
            merged["imageUrl"] = storedImage
        }
        if let categoriesTags = hit.categoriesTags {
            merged["categoriesTags"] = categoriesTags
        } else {
            merged.removeValue(forKey: "categoriesTags")
        }
        return try JSONPatch.decode(FoodCreate.self, from: merged)
    }

    /// Fields the user owns; Open Food Facts never overwrites them.
    private static let userOwnedFoodKeys = [
        "name", "brand", "servingSize", "servingUnit",
        "calories", "protein", "carbs", "fat", "fiber",
        "barcode", "isFavorite",
    ]

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
        let id = TempIdMap.resolved(id)
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
        IntentDonations.reindexFood(optimistic)
        return optimistic
    }

    /// Attaches or removes a food's image, as a partial PATCH — same reasoning
    /// as `toggleFavorite`: the edit form's `FoodCreate` omits nil optionals,
    /// so a removal sent through it would never reach the server. The
    /// superseded image is dropped from the device, which for a Local-mode
    /// `file://` photo is the only copy there is.
    @discardableResult
    func setImage(id: String, imageUrl: String?) async throws -> Food {
        let id = TempIdMap.resolved(id)
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

    /// Replaces the food's labels — the English nouns search matches against.
    /// Optimistic like every other edit. Labels never ride on a food body, so a
    /// temp-id food gets its own queued op; the temp-id remap that follows the
    /// create's response points it at the server id before it is sent.
    @discardableResult
    func setLabels(id: String, labels: [String]) async throws -> Food {
        let id = TempIdMap.resolved(id)
        let normalized = LabelNormalizer.normalizeAll(labels).sorted()
        guard let row = fetchRow(id: id), let current = row.toFood(),
              let patched = try? JSONPatch.merged(Food.self, base: current, patch: ["labels": normalized])
        else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        syncManager.enqueue(.setFoodLabels(id: id, labels: labels))
        IntentDonations.reindexFood(patched)
        return patched
    }

    /// Merges labeller-suggested labels into whatever the food already
    /// carries — additive like the server's `source: llm, mode: extend`
    /// write, so it never drops a label the user set by hand. Used by the
    /// "Suggest labels" button's merge-for-review step and by
    /// `FoodAutoLabeler`'s unattended sweep.
    @discardableResult
    func addGeneratedLabels(id: String, labels: [String]) async throws -> Food {
        let id = TempIdMap.resolved(id)
        guard let row = fetchRow(id: id), let current = row.toFood() else {
            throw APIError.notFound
        }
        let suggested = LabelNormalizer.normalizeAll(labels)
        guard !suggested.isEmpty else { return current }
        let merged = LabelNormalizer.normalizeAll((current.labels ?? []) + suggested).sorted()
        guard let patched = try? JSONPatch.merged(Food.self, base: current, patch: ["labels": merged]) else {
            throw APIError.notFound
        }
        row.update(from: patched)
        save()
        syncManager.enqueue(.addGeneratedFoodLabels(id: id, labels: suggested))
        return patched
    }

    func deleteFood(id: String) async throws {
        let id = TempIdMap.resolved(id)
        LocalImageStore.evict(food(id: id)?.imageUrl)
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "foods", affectedId: id)
        } else {
            syncManager.enqueue(.deleteFood(id: id, force: false))
        }
        IntentDonations.removeFoods([id])
    }

    /// Asks first instead of deleting-then-hoping: `deleteFood` always deletes
    /// locally and queues the server delete, which — if the food still has diary
    /// entries or is used by a recipe — used to dead-letter on the resulting 409
    /// and reappear on the next refresh, with no indication to the user why. In
    /// Local mode (or a not-yet-uploaded temp id) there is no server to ask, so
    /// entries, recipes and supplements referencing it are read from the local
    /// store instead, with the same rules as the server.
    func deleteFoodChecked(id: String) async throws -> DeleteOutcome {
        let id = TempIdMap.resolved(id)
        if appMode.isLocal || LocalStore.isTempId(id) {
            if let conflict = localUsage(foodId: id).conflict {
                return .blocked(conflict)
            }
            try await deleteFood(id: id)
            return .deleted
        }
        do {
            try await api.deleteFood(id: id)
            LocalImageStore.evict(food(id: id)?.imageUrl)
            deleteRow(id: id)
            save()
            syncManager.removeQueued(table: "foods", affectedId: id)
            return .deleted
        } catch let error as APIError {
            if let conflict = error.deleteConflict {
                return .blocked(conflict)
            }
            try await deleteFood(id: id)
            return .deleted
        }
    }

    /// Deletes a food the user already confirmed via a `DeleteOutcome.blocked` prompt.
    /// Refused when `DeleteConflict.forceUnavailable` applies — the prompt must
    /// not offer it, and the server refuses it too.
    func forceDeleteFood(id: String) async throws {
        let id = TempIdMap.resolved(id)
        if appMode.isLocal || LocalStore.isTempId(id) {
            if localUsage(foodId: id).conflict?.forceUnavailable == true {
                throw APIError.conflict(serverNewer: false, body: nil)
            }
            try await deleteFood(id: id)
            if appMode.isLocal { removeFromLocalRecipes(foodId: id) }
            return
        }
        let imageUrl = food(id: id)?.imageUrl
        deleteRow(id: id)
        save()
        do {
            try await api.deleteFood(id: id, force: true)
            syncManager.removeQueued(table: "foods", affectedId: id)
        } catch {
            if error is CancellationError { throw error }
            syncManager.enqueue(.deleteFood(id: id, force: true))
        }
        if let imageUrl { LocalImageStore.evict(imageUrl) }
    }

    /// The diary entries, recipes and supplements that use this food, so a
    /// blocked delete can point the user at what to change. Local mode (or a
    /// not-yet-uploaded temp id) reads the local store instead of asking the server.
    func whereUsed(id: String) async throws -> WhereUsed {
        let id = TempIdMap.resolved(id)
        guard appMode.isLocal || LocalStore.isTempId(id) else {
            return try await api.getFoodUsage(id: id)
        }
        let usage = localUsage(foodId: id)
        let byName = { (lhs: WhereUsedRef, rhs: WhereUsedRef) in
            lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
        let entries = WhereUsed.sortedNewestFirst(usage.entries.map(\.whereUsedEntry))
        return WhereUsed(
            entries: Array(entries.prefix(WhereUsed.entryLimit)),
            totalEntries: usage.entries.count,
            recipes: usage.recipes.map {
                WhereUsedRef(id: $0.id, name: $0.name, isLastIngredient: $0.hasOnlyIngredient(id))
            }.sorted(by: byName),
            supplements: usage.supplements.map { WhereUsedRef(id: $0.id, name: $0.name) }.sorted(by: byName)
        )
    }

    private struct LocalUsage {
        let foodId: String
        let entries: [LocalEntry]
        let recipes: [Recipe]
        let supplements: [Supplement]

        /// Mirrors the server's `deleteFood` rules; nil when nothing references the food.
        var conflict: DeleteConflict? {
            guard !entries.isEmpty || !recipes.isEmpty || !supplements.isEmpty else { return nil }
            let ingredientCount = recipes.reduce(0) { total, recipe in
                total + (recipe.ingredients ?? []).count { $0.foodId == foodId }
            }
            let supplementCount = supplements.reduce(0) { total, supplement in
                total + supplement.ingredients.count { $0.foodId == foodId }
            }
            return DeleteConflict(
                entryCount: entries.count,
                ingredientCount: ingredientCount,
                recipeCount: recipes.count,
                supplementIngredientCount: supplementCount,
                lastIngredientRecipes: recipes
                    .filter { $0.hasOnlyIngredient(foodId) }
                    .map { WhereUsedRef(id: $0.id, name: $0.name, isLastIngredient: true) }
            )
        }
    }

    private func localUsage(foodId: String) -> LocalUsage {
        let entryDescriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.foodId == foodId })
        let recipeRows = (try? context.fetch(FetchDescriptor<LocalRecipe>())) ?? []
        let supplementRows = (try? context.fetch(FetchDescriptor<LocalSupplement>())) ?? []
        return LocalUsage(
            foodId: foodId,
            entries: (try? context.fetch(entryDescriptor)) ?? [],
            recipes: recipeRows.compactMap { $0.toRecipe() }
                .filter { ($0.ingredients ?? []).contains { $0.foodId == foodId } },
            supplements: supplementRows.compactMap { $0.toSupplement() }
                .filter { $0.ingredients.contains { $0.foodId == foodId } }
        )
    }

    /// Local-mode counterpart of the server's ON DELETE CASCADE on recipe
    /// ingredients: a forced food delete removes the food from every recipe that
    /// keeps other ingredients (never one it is the only ingredient of — that
    /// delete is refused) and recomputes their macros without it.
    private func removeFromLocalRecipes(foodId: String) {
        let rows = (try? context.fetch(FetchDescriptor<LocalRecipe>())) ?? []
        for row in rows {
            guard let recipe = row.toRecipe(),
                  let ingredients = recipe.ingredients,
                  ingredients.contains(where: { $0.foodId == foodId })
            else { continue }
            let remaining = ingredients.filter { $0.foodId != foodId }.enumerated().map { index, ingredient in
                RecipeIngredient(
                    id: ingredient.id,
                    recipeId: ingredient.recipeId,
                    foodId: ingredient.foodId,
                    quantity: ingredient.quantity,
                    servingUnit: ingredient.servingUnit,
                    sortOrder: index,
                    food: ingredient.food ?? LocalRemap.foodRow(id: ingredient.foodId, in: context)?.toFood()
                )
            }
            guard !remaining.isEmpty else { continue }
            row.update(from: RecipeRepository.applying(ingredients: remaining, to: recipe))
        }
        save()
    }

    @discardableResult
    func toggleFavorite(foodId: String, isFavorite: Bool) async throws -> Food {
        let foodId = TempIdMap.resolved(foodId)
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

    /// Server-computed candidate groups for foods that may be the same
    /// product (same barcode, same normalized name+brand, or a similar name
    /// with near-identical per-serving macros). No local fallback: this is
    /// inherently a server-side computation over the whole food set, and
    /// unavailable to an anonymous/local-only account.
    func fetchDuplicates() async throws -> [FoodDuplicateGroup] {
        guard !appMode.isLocal else {
            throw APIError.badRequest("Duplicate detection requires an account")
        }
        return try await api.getFoodDuplicates()
    }

    /// Merges `sourceIds` into `keeperId` and reconciles local state: the
    /// keeper's cached row is updated with the (possibly auto-filled) server
    /// fields, each source is pruned from the local catalog exactly like
    /// `deleteFood` (image eviction, queued-write cleanup), and any locally
    /// cached entry still pointing at a source id is refreshed from the
    /// server via the same `SyncManager.onFoodReferenceMissing` path that
    /// already reconciles a food gone missing mid-queue-drain (BISSBILANZ-33,
    /// see the comment on `refreshFood` above) — its app-level handler
    /// re-fetches each affected food (pruning it again, harmlessly) and
    /// refreshes every locally cached day that still names it, so the
    /// entry's `foodId` and rescaled servings catch up with the merge.
    /// Unavailable to an anonymous/local-only account — there is no server to
    /// merge on.
    @discardableResult
    func mergeFoods(
        keeperId: String,
        sourceIds: [String],
        overrides: [String: FoodMergeValue] = [:]
    ) async throws -> Food {
        guard !appMode.isLocal else {
            throw APIError.badRequest("Merging foods requires an account")
        }
        let keeperId = TempIdMap.resolved(keeperId)
        let sourceIds = sourceIds.map(TempIdMap.resolved)
        let merged = try await api.mergeFoods(keeperId: keeperId, sourceIds: sourceIds, overrides: overrides)
        upsert(merged)
        for sourceId in sourceIds {
            LocalImageStore.evict(food(id: sourceId)?.imageUrl)
            deleteRow(id: sourceId)
            syncManager.removeQueued(table: "foods", affectedId: sourceId)
        }
        save()
        IntentDonations.reindexFood(merged)
        IntentDonations.removeFoods(sourceIds)
        await syncManager.onFoodReferenceMissing?(Set(sourceIds))
        return merged
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
        context.saveReportingFailure("FoodRepository.save")
        WidgetSnapshotWriter.scheduleUpdate(context: context)
    }
}

fileprivate extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0 ..< Swift.min($0 + size, count)]) }
    }
}

/// Where `FoodRepository.mirrorAll` remembers how far it got. Cleared with the
/// rest of the local data (`LocalDataMigrator.wipeLocalData`), so the next
/// account starts from a fresh sync.
enum FoodMirrorState {
    static let checkpointKey = "food_mirror_checkpoint"
    static let prunedAtKey = "food_mirror_pruned_at"

    static func reset(_ defaults: UserDefaults) {
        defaults.removeObject(forKey: checkpointKey)
        defaults.removeObject(forKey: prunedAtKey)
    }
}
