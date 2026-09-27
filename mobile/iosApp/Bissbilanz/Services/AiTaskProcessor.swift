import Foundation
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Resolves queued `AiTask`s on this iPhone instead of the MCP assistant, when
/// the user has set `Preferences.aiTaskProcessor` to `.aiTaskProcessorDevice`.
/// Injected like `AiTaskStore`; triggered from `AiTaskStore.onRefreshed` (see
/// that property's doc comment for why that one hook covers app foreground,
/// `AiTasksView` opening and `BackgroundRefresher`'s background pull alike).
///
/// **Pipeline**, per pending task, mirroring the plan's four passes:
/// 1. Download the task's photos over the account's bearer token
///    (`BissbilanzAPI.downloadImage`, the same authenticated path
///    `AiTaskImageViewer` renders them through).
/// 2. **Label + barcode pass**: `NutritionLabelScanner.scan` each photo;
///    `NutritionLabelValidator.isValidLabel` decides whether a photo is an
///    actual nutrition-facts panel (excluded from the meal pass below either
///    way, since a label/packaging shot isn't a photo of the meal itself).
///    A barcode resolves to a real food immediately either way — a
///    deterministic local/Open Food Facts lookup, not an AI guess — via
///    `FoodRepository.findLocalByBarcode` then
///    `findOrCreateFromOpenFoodFacts(barcode:)`. Absent a barcode, a valid
///    label's own numbers become a `FoodCreate` — created immediately in
///    auto-log mode, held as a draft (`ProcessedAiTaskDraft.pendingFoods`)
///    for review-first.
/// 3. **Link pass**: the first URL in the description (only when nothing was
///    found above) is fetched and read the same way — see
///    `extractProductFromLink`.
/// 4. **Meal pass**: `MealEstimator.estimate(description:images:)` over the
///    description and the *non*-label photos. A food resolved or drafted
///    above is prepended as its own logged/reviewed item (1 serving) rather
///    than left for the model to (re-)find by name — the model only ever
///    sees non-label photos, so a label-only task (no text mentioning the
///    product) would otherwise have nothing to match it against at all. This
///    can occasionally double up with an independent mention of the same food
///    in the description; left for the user to notice and remove in
///    review-first, an accepted rough edge in auto-log.
///
/// **Outcome**: nothing loggable → the task is dismissed with a localized
/// reason. Auto-log creates entries immediately and queues
/// `.completeAiTask`. Review-first persists a `ProcessedAiTaskDraft` instead
/// (nothing is logged, and a label/link `FoodCreate` stays a draft, until the
/// user confirms in `AIMealReviewView`). Any thrown error along the way
/// (network, a still-loading model, a rate limit) leaves the task untouched —
/// still pending for the next trigger — rather than dismissing it.
@MainActor
@Observable
final class AiTaskProcessor {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let preferencesRepository: PreferencesRepository
    private let mealEstimator: MealEstimator
    private let foodRepository: FoodRepository
    private let entryRepository: EntryRepository
    private let syncManager: SyncManager
    private let aiTaskStore: AiTaskStore
    private let draftRoot: URL

    /// Task ids currently being processed — guards against the same task
    /// being picked up twice by triggers landing close together (e.g. a
    /// foreground activation racing a just-finished background refresh).
    private var inFlightTaskIds: Set<String> = []
    private var isProcessing = false

    init(
        api: BissbilanzAPI,
        appMode: AppModeManager,
        preferencesRepository: PreferencesRepository,
        mealEstimator: MealEstimator,
        foodRepository: FoodRepository,
        entryRepository: EntryRepository,
        syncManager: SyncManager,
        aiTaskStore: AiTaskStore,
        draftRoot: URL = AiTaskDraftDisk.defaultRoot
    ) {
        self.api = api
        self.appMode = appMode
        self.preferencesRepository = preferencesRepository
        self.mealEstimator = mealEstimator
        self.foodRepository = foodRepository
        self.entryRepository = entryRepository
        self.syncManager = syncManager
        self.aiTaskStore = aiTaskStore
        self.draftRoot = draftRoot
    }

    /// Whether this device is set up to process tasks at all right now:
    /// Synced mode (Local has no server-side queue to process), the user
    /// routed tasks here rather than the MCP assistant, and this device can
    /// actually produce an estimate on-device or via Private Cloud Compute.
    var isEnabled: Bool {
        guard !appMode.isLocal, mealEstimator.canEstimate else { return false }
        return preferencesRepository.preferences()?.aiTaskProcessor == Preferences.aiTaskProcessorDevice
    }

    /// Processes every pending task not already in flight or already sitting
    /// on disk awaiting review, one at a time — serial rather than concurrent
    /// so two triggers landing close together can't run two on-device model
    /// sessions at once. Best-effort throughout: one task's failure is
    /// reported and left pending rather than aborting the rest.
    func processPendingTasks() async {
        guard isEnabled, !isProcessing else { return }
        isProcessing = true
        defer { isProcessing = false }
        let pending = aiTaskStore.tasks.filter { $0.status == "pending" }
        for task in pending {
            guard !inFlightTaskIds.contains(task.id) else { continue }
            guard AiTaskDraftDisk.load(taskId: task.id, root: draftRoot) == nil else { continue }
            inFlightTaskIds.insert(task.id)
            await process(task)
            inFlightTaskIds.remove(task.id)
        }
    }

    private func process(_ task: AiTask) async {
        do {
            let photos = await downloadPhotos(task)
            // A task with photos but zero successful downloads is almost
            // certainly this device being offline, not a task with nothing to
            // see — treat it as the same "leave pending, retry later" case as
            // any other thrown error, rather than silently falling through to
            // a text-only pass that could wrongly dismiss it as empty.
            guard task.photoUrls.isEmpty || !photos.isEmpty else {
                throw APIError.networkError(URLError(.notConnectedToInternet))
            }
            let scans = await scanPhotos(photos)
            let labelPhotoIndices = Set(scans.filter { NutritionLabelValidator.isValidLabel($0.nutrition) }.map(\.index))

            var resolvedFood: Food?
            var pendingFoodCreate: FoodCreate?
            let detectedBarcode = scans.compactMap(\.nutrition.barcode).first

            if let detectedBarcode {
                // Nil here means OFF has no record of this barcode (an
                // unbranded or region-specific product) — the label pass
                // below still has a shot at it, and carries the barcode
                // along so the food it creates isn't missing it.
                resolvedFood = try await resolveBarcode(detectedBarcode)
            }

            if resolvedFood == nil,
               let labelScan = scans.first(where: { labelPhotoIndices.contains($0.index) })
            {
                let name = Self.productName(fromDescription: task.description)
                pendingFoodCreate = Self.foodCreate(from: labelScan.nutrition, name: name, barcode: detectedBarcode)
            }

            if resolvedFood == nil, pendingFoodCreate == nil, let description = task.description {
                if let url = AiTaskLinkExtractor.urls(in: description).first {
                    pendingFoodCreate = await extractProductFromLink(url)
                }
            }

            let autoLog = preferencesRepository.preferences()?.aiTaskAutoLog ?? false
            if autoLog, resolvedFood == nil, let create = pendingFoodCreate {
                resolvedFood = try await foodRepository.createFood(create)
                pendingFoodCreate = nil
            }

            let nonLabelImages = photos.enumerated()
                .filter { !labelPhotoIndices.contains($0.offset) }
                .compactMap { UIImage(data: $0.element) }
            let trimmedDescription = task.description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            // A pure label/barcode task (a nutrition-facts photo and nothing
            // else) has nothing left worth a model call once its own photo is
            // excluded above — the resolved/pending food handled below is the
            // whole story, so skip straight to it rather than prompting the
            // model with empty input.
            let estimate: MealEstimate = if trimmedDescription.isEmpty, nonLabelImages.isEmpty {
                MealEstimate(items: [])
            } else {
                try await mealEstimator.estimate(description: trimmedDescription, images: nonLabelImages)
            }

            var items = estimate.items
            var pendingFoods: [String: FoodCreate] = [:]
            if let resolvedFood {
                items.insert(Self.item(for: resolvedFood), at: 0)
            } else if let pendingFoodCreate {
                let key = Self.pendingFoodKey()
                items.insert(Self.item(forDraftKey: key, create: pendingFoodCreate), at: 0)
                pendingFoods[key] = pendingFoodCreate
            }

            guard !items.isEmpty else {
                await dismiss(task, reason: L10n.aiTaskProcessorNothingFoundReason, source: estimate.source)
                return
            }

            if autoLog {
                await completeAutomatically(task, items: items, source: estimate.source)
            } else {
                let draft = ProcessedAiTaskDraft(
                    taskId: task.id,
                    date: task.date,
                    mealType: task.mealType,
                    eatenAt: task.eatenAt,
                    items: items,
                    pendingFoods: pendingFoods,
                    source: estimate.source,
                    queuedAt: Date()
                )
                try AiTaskDraftDisk.save(draft, root: draftRoot)
            }
        } catch {
            // Left exactly as-is (still "pending") for the next trigger to
            // retry — a thrown error here is a model that isn't ready yet, a
            // rate limit, or the network, none of which the user should be
            // told "could not be logged" over.
            ErrorReporter.captureWarning("AiTaskProcessor: task left pending after an error", context: [
                "task_id": task.id,
                "reason": ErrorReporter.reason(for: error),
            ])
        }
    }

    private func resolveBarcode(_ barcode: String) async throws -> Food? {
        if let local = foodRepository.findLocalByBarcode(barcode) {
            return local
        }
        return try await foodRepository.findOrCreateFromOpenFoodFacts(barcode: barcode)
    }

    /// Logs every item as its own entry (matched food when `matchedFoodId` is
    /// a real id, quick log otherwise), then queues `.completeAiTask` with
    /// whichever local entry ids actually made it — mirroring
    /// `AIMealReviewView.logAll`, one item's failure doesn't stop the rest.
    private func completeAutomatically(_ task: AiTask, items: [MealEstimateItem], source: MealEstimateSource) async {
        var localEntryIds: [String] = []
        for item in items {
            do {
                localEntryIds.append(try await createEntry(for: item, task: task))
            } catch {
                ErrorReporter.captureWarning(
                    "AiTaskProcessor: an item failed to log, logging the rest",
                    context: ["task_id": task.id, "reason": ErrorReporter.reason(for: error)]
                )
            }
        }
        guard !localEntryIds.isEmpty else {
            ErrorReporter.captureWarning(
                "AiTaskProcessor: every entry create failed, task left pending",
                context: ["task_id": task.id]
            )
            return
        }
        syncManager.enqueue(.completeAiTask(
            taskId: task.id,
            localEntryIds: localEntryIds,
            resultSummary: Self.summarize(items: items),
            processedBy: Self.processedBy(for: source)
        ))
        aiTaskStore.markResolvedLocally(id: task.id)
    }

    private func createEntry(for item: MealEstimateItem, task: AiTask) async throws -> String {
        let mealType = task.mealType ?? MealTiming.mealForCurrentTime()
        if let matchedId = item.matchedFoodId, let food = foodRepository.food(id: matchedId) {
            let servings = Self.resolvedServings(for: item, food: food)
            let entry = EntryCreate(
                foodId: food.id, mealType: mealType, servings: servings, date: task.date, eatenAt: task.eatenAt
            )
            return try await entryRepository.createEntry(entry, food: food).id
        }
        let entry = EntryCreate(
            mealType: mealType,
            servings: 1,
            date: task.date,
            quickName: item.name,
            quickCalories: item.calories,
            quickProtein: item.protein,
            quickCarbs: item.carbs,
            quickFat: item.fat,
            quickFiber: item.fiber,
            eatenAt: task.eatenAt
        )
        return try await entryRepository.createEntry(entry).id
    }

    /// Prefers the model's own serving count; otherwise converts an estimated
    /// gram amount using the matched food's serving size, but only when that
    /// food's serving unit is grams — mirrors
    /// `AIMealReviewView.resolvedServings`. Falls back to a single serving
    /// rather than returning nil, since an unattended log has no one to ask.
    private static func resolvedServings(for item: MealEstimateItem, food: Food) -> Double {
        if let servings = item.servings { return servings }
        if let grams = item.grams, food.servingUnit == .g, food.servingSize > 0 {
            return grams / food.servingSize
        }
        return 1
    }

    private func dismiss(_ task: AiTask, reason: String, source: MealEstimateSource) async {
        let update = AiTaskUpdate(status: "dismissed", resultSummary: reason, processedBy: Self.processedBy(for: source))
        guard (try? await api.updateAiTask(id: task.id, update)) != nil else { return }
        aiTaskStore.markResolvedLocally(id: task.id)
    }

    // MARK: - Photos

    private struct PhotoScan {
        let index: Int
        let nutrition: ParsedNutrition
    }

    private func downloadPhotos(_ task: AiTask) async -> [Data] {
        var result: [Data] = []
        for path in task.photoUrls {
            if let data = try? await api.downloadImage(path: path) {
                result.append(data)
            }
        }
        return result
    }

    private func scanPhotos(_ photos: [Data]) async -> [PhotoScan] {
        let scanner = NutritionLabelScanner()
        var results: [PhotoScan] = []
        for (index, data) in photos.enumerated() {
            if let nutrition = try? await scanner.scan(data) {
                results.append(PhotoScan(index: index, nutrition: nutrition))
            }
        }
        return results
    }

    // MARK: - Building foods/items (pure — see AiTaskProcessorTests)

    /// A trimmed slice of the task's own description, since that is almost
    /// always the product's name written by the person photographing it
    /// (e.g. "the yogurt I had"); falls back to a generic name the user can
    /// rename later, on the food itself (auto-log) or before confirming
    /// (review-first).
    static func productName(fromDescription description: String?) -> String {
        guard let description else { return L10n.aiTaskProcessorScannedProductName }
        let trimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return L10n.aiTaskProcessorScannedProductName }
        return String(trimmed.prefix(60))
    }

    static func foodCreate(from nutrition: ParsedNutrition, name: String, barcode: String? = nil) -> FoodCreate {
        FoodCreate(
            name: name,
            servingSize: 100,
            servingUnit: nutrition.isVolume ? .ml : .g,
            calories: nutrition.calories ?? 0,
            protein: nutrition.protein ?? 0,
            carbs: nutrition.carbs ?? 0,
            fat: nutrition.fat ?? 0,
            fiber: nutrition.fiber ?? 0,
            saturatedFat: nutrition.saturatedFat,
            sugar: nutrition.sugar,
            sodium: nutrition.sodium,
            salt: nutrition.salt,
            barcode: barcode
        )
    }

    private static func item(for food: Food) -> MealEstimateItem {
        MealEstimateItem(
            name: food.name,
            matchedFoodId: food.id,
            quantityDescription: "1 \(food.servingUnit.displayName)",
            grams: nil,
            servings: 1,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            confidence: 1
        )
    }

    private static func item(forDraftKey key: String, create: FoodCreate) -> MealEstimateItem {
        MealEstimateItem(
            name: create.name,
            matchedFoodId: key,
            quantityDescription: "1 \(create.servingUnit.displayName)",
            grams: nil,
            servings: 1,
            calories: create.calories,
            protein: create.protein,
            carbs: create.carbs,
            fat: create.fat,
            fiber: create.fiber,
            confidence: 1
        )
    }

    /// Marks an item's `matchedFoodId` as a draft food awaiting confirmation
    /// rather than a real id — see `ProcessedAiTaskDraft` and
    /// `AIMealReviewView`'s handling of `pendingFoods`.
    static let pendingFoodKeyPrefix = "ai_task_pending:"

    static func pendingFoodKey() -> String {
        pendingFoodKeyPrefix + UUID().uuidString
    }

    static func isPendingFoodKey(_ matchedFoodId: String?) -> Bool {
        matchedFoodId?.hasPrefix(pendingFoodKeyPrefix) == true
    }

    static func processedBy(for source: MealEstimateSource) -> String {
        switch source {
        case .onDevice: "on_device"
        case .privateCloudCompute: "private_cloud"
        }
    }

    /// e.g. "Logged egg, toast (≈420 kcal)" — names in the order they were
    /// logged, and the total across every item (matched or quick).
    static func summarize(items: [MealEstimateItem]) -> String {
        let joined = items.map(\.name).joined(separator: ", ")
        let totalCalories = Int(items.reduce(0.0) { $0 + ($1.calories ?? 0) }.rounded())
        return L10n.aiTaskProcessorResultSummary(joined, totalCalories)
    }

    // MARK: - Link pass

    /// Fetches `url` and, when Foundation Models can extract a specific
    /// product's nutrition facts from its text, returns a draft `FoodCreate`.
    /// Nil on any failure — a network error, a page that isn't a product
    /// page, or a model that isn't available — so a bad link just leaves the
    /// meal pass to work from the description and photos alone.
    private func extractProductFromLink(_ url: URL) async -> FoodCreate? {
        guard let text = await AiTaskLinkExtractor.fetchPlainText(from: url), !text.isEmpty else { return nil }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return await Self.extractProduct(fromPageText: text)
        }
        #endif
        return nil
    }
}

#if canImport(FoundationModels)

@available(iOS 26.0, *)
extension AiTaskProcessor {
    private static let linkExtractionInstructions = """
    You are extracting a food product's identity and nutrition facts from the plain \
    text of a web page a user linked while logging a meal. If the text clearly \
    describes one specific packaged food or drink product with numeric nutrition \
    facts (per 100 g/ml, or per serving together with the serving size), fill in \
    every field you can read directly from the text; leave a field nil rather than \
    estimating or guessing a number that is not actually stated. If the text does \
    not look like a specific product's page at all (a recipe, a news article, a \
    restaurant menu with no per-item numbers, a page that failed to load), set \
    isProduct to false and leave every other field nil.
    """

    static func extractProduct(fromPageText text: String) async -> FoodCreate? {
        guard case .available = SystemLanguageModel.default.availability else { return nil }
        let session = LanguageModelSession(instructions: linkExtractionInstructions)
        do {
            let response = try await session.respond(to: text, generating: ExtractedLinkProduct.self)
            let extraction = response.content
            guard extraction.isProduct, let name = extraction.name, !name.isEmpty else { return nil }
            let nutrition = ParsedNutrition(
                calories: extraction.calories,
                protein: extraction.protein,
                carbs: extraction.carbs,
                fat: extraction.fat,
                fiber: extraction.fiber,
                isVolume: extraction.basisUnit?.lowercased() == "ml"
            )
            guard NutritionLabelValidator.isValidLabel(nutrition) else { return nil }
            return foodCreate(from: nutrition, name: name)
        } catch {
            // Reported rather than swallowed, same as NutritionLabelScanner's
            // own Foundation Models failure — the caller still degrades
            // gracefully to "nothing found on this link", but a silent
            // failure here would otherwise be invisible in production.
            ErrorReporter.captureWarning(
                "AiTaskProcessor link extraction failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            return nil
        }
    }
}

@available(iOS 26.0, *)
@Generable
private struct ExtractedLinkProduct {
    @Guide(description: "True only if this page describes one specific packaged food or drink product")
    let isProduct: Bool

    @Guide(description: "The product's name as shown on the page, only if isProduct is true")
    let name: String?

    @Guide(description: "\"ml\" if the nutrition facts are per 100 ml (a drink), otherwise \"g\"")
    let basisUnit: String?

    @Guide(description: "Energy per 100 g/ml in kcal")
    let calories: Double?

    @Guide(description: "Protein per 100 g/ml in grams")
    let protein: Double?

    @Guide(description: "Total carbohydrate per 100 g/ml in grams")
    let carbs: Double?

    @Guide(description: "Total fat per 100 g/ml in grams")
    let fat: Double?

    @Guide(description: "Dietary fibre per 100 g/ml in grams")
    let fiber: Double?
}

#endif
