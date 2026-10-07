import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// On-device meal estimation from free-text ("2 eggs and a slice of toast"),
/// gated behind Apple's FoundationModels (Apple Intelligence, iOS 26+). Mirrors
/// the `#if compiler(>=6.2)` / `#available(iOS 26.0, *)` pattern in
/// `LiquidGlass.swift` / `NutritionLabelScanner.swift`: the FoundationModels
/// types only exist behind `#if canImport(FoundationModels)`, so everything
/// public stays visible on older SDKs/OS versions and simply reports
/// `.osUnsupported`.
///
/// The queue-based fallback mentioned above shipped as "send to my assistant"
/// (`AIMealSheet`). `MealEstimatorPrivateCloud.swift` adds a second one,
/// in-line rather than queued: when the on-device attempt is unavailable,
/// refuses, overflows its context window, or comes back obviously weak,
/// `estimate(description:)` (and the photo variant) retries on Apple's
/// Private Cloud Compute server model (iOS 27+) before giving up.
enum MealEstimatorAvailability: Equatable {
    case available
    case deviceNotEligible
    case appleIntelligenceDisabled
    case modelNotReady
    case osUnsupported
}

enum MealEstimatorError: Error {
    case guardrailViolation
    case contextWindowExceeded
    case unsupportedLanguage
    /// The model's output could not be deserialized into the `@Generable`
    /// shape (`LanguageModelSession.GenerationError.decodingFailure`), even
    /// after `MealEstimateGeneration` retried it.
    case decodingFailed
    case generationFailed(String)

    var localizedMessage: String {
        switch self {
        case .guardrailViolation:
            L10n.aiMealGuardrailError
        case .contextWindowExceeded:
            L10n.aiMealContextWindowError
        case .unsupportedLanguage:
            L10n.aiMealUnsupportedLanguageError
        case .decodingFailed:
            L10n.aiMealDecodingError
        case let .generationFailed(message):
            message.isEmpty ? L10n.aiMealGenerationError : message
        }
    }

    /// Short, stable classification for telemetry (`ErrorReporter.captureWarning`),
    /// since a localized message says nothing about why generation failed.
    var telemetryReason: String {
        switch self {
        case .guardrailViolation: "guardrail_violation"
        case .contextWindowExceeded: "context_window_exceeded"
        case .unsupportedLanguage: "unsupported_language"
        case .decodingFailed: "decoding_failed"
        case let .generationFailed(message): "generation_failed: \(message)"
        }
    }
}

/// Plain result types, available on every OS version/compiler this project
/// builds with — only the code that produces them is gated.
struct MealEstimate: Codable, Equatable {
    var items: [MealEstimateItem]
    /// Which model actually produced this estimate — `.onDevice` unless the
    /// Private Cloud Compute fallback (`MealEstimatorPrivateCloud.swift`) ran
    /// instead. Defaulted so existing call sites (and any on-device variant
    /// added later, e.g. for photos) don't need to know this case exists.
    var source: MealEstimateSource = .onDevice
}

/// `Codable`: `AiTaskProcessor`'s review-first flow persists a `MealEstimate`
/// to disk as part of `ProcessedAiTaskDraft` until the user confirms it.
enum MealEstimateSource: String, Equatable, Codable {
    case onDevice
    case privateCloudCompute
}

struct MealEstimateItem: Identifiable, Codable, Equatable {
    let id = UUID()
    var name: String
    var matchedFoodId: String?
    var quantityDescription: String
    var grams: Double?
    var servings: Double?
    var calories: Double?
    var protein: Double?
    var carbs: Double?
    var fat: Double?
    var fiber: Double?
    var confidence: Double
    /// Sanity-check findings from `MealEstimateValidator`. Optional so a draft
    /// persisted before this field existed still decodes.
    var warnings: [MealEstimateWarning]?

    /// Whether the numbers need a human look before this item is logged.
    var hasBlockingWarning: Bool {
        warnings?.contains(where: { $0.isBlocking }) ?? false
    }

    /// Builds an item from the model's raw generated fields, applying the
    /// hallucination guard: drops any `matchedFoodId` the search tool never
    /// actually returned, so a fabricated id can't slip through. Takes plain
    /// values rather than the `@Generable` `EstimatedItem` (which only exists
    /// behind `#if canImport(FoundationModels)`) so this mapping is testable
    /// on every platform/compiler, with or without Apple Intelligence — see
    /// `MealEstimatorEvaluationTests`.
    static func fromGenerated(
        name: String,
        matchedFoodId: String?,
        quantityDescription: String,
        grams: Double?,
        servings: Double?,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        fiber: Double,
        confidence: Double,
        validMatchedFoodIds: Set<String>
    ) -> MealEstimateItem {
        let matchedFoodId = matchedFoodId.flatMap { validMatchedFoodIds.contains($0) ? $0 : nil }
        return MealEstimateItem(
            name: name,
            matchedFoodId: matchedFoodId,
            quantityDescription: quantityDescription,
            grams: grams,
            servings: matchedFoodId != nil ? servings : nil,
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
            fiber: fiber,
            confidence: confidence
        )
    }
}

@MainActor
@Observable
final class MealEstimator {
    private let foodRepository: FoodRepository

    init(foodRepository: FoodRepository) {
        self.foodRepository = foodRepository
    }

    var availability: MealEstimatorAvailability {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return .available
            case .unavailable(.deviceNotEligible):
                return .deviceNotEligible
            case .unavailable(.appleIntelligenceNotEnabled):
                return .appleIntelligenceDisabled
            case .unavailable(.modelNotReady):
                return .modelNotReady
            case .unavailable:
                return .modelNotReady
            }
        }
        #endif
        return .osUnsupported
    }

    /// Warms the model so the first real `estimate(description:)` call after
    /// opening the sheet doesn't pay the full cold-start latency. Best-effort
    /// — a session that fails to prewarm is simply prewarmed lazily instead.
    func prewarm() {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            makeSession(matchedIds: MatchedFoodIds()).prewarm()
        }
        #endif
    }

    func estimate(description: String) async throws -> MealEstimate {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return try await estimateWithFallback(
                onDevice: { try await estimateWithFoundationModels(description: description) },
                privateCloud: { try await estimateWithPrivateCloudCompute(description: description) }
            )
        }
        #endif
        throw MealEstimatorError.generationFailed(L10n.aiMealOsUnsupported)
    }

    /// Shared on-device → Private Cloud Compute routing for the text and photo
    /// paths (`MealEstimator+Photo.swift`). On-device runs first when it's
    /// available; a weak result or a refusal/context overflow retries on PCC.
    /// When on-device is unavailable (ineligible device, Apple Intelligence
    /// off, model still downloading), PCC is the only option, so its own error
    /// surfaces instead of being swallowed.
    func estimateWithFallback(
        onDevice: () async throws -> MealEstimate,
        privateCloud: () async throws -> MealEstimate
    ) async throws -> MealEstimate {
        guard availability == .available else {
            guard isPrivateCloudComputeAvailable else {
                throw MealEstimatorError.generationFailed(L10n.aiMealOsUnsupported)
            }
            return try await privateCloud()
        }
        do {
            let result = try await onDevice()
            guard Self.isWeakEstimate(result) else { return result }
            // A weak result still beats nothing — only replace it if the
            // fallback actually produced something better.
            guard let fallback = await privateCloudFallback(privateCloud) else { return result }
            return Self.preferredEstimate(onDevice: result, privateCloud: fallback)
        } catch {
            if let fallback = await privateCloudFallback(privateCloud, retryableAfter: error) {
                return fallback
            }
            throw error
        }
    }

    /// Attempts the Private Cloud Compute fallback (`MealEstimatorPrivateCloud.swift`).
    /// `retryableAfter`, when given, only proceeds for the specific on-device
    /// failures that fallback is meant to catch (guardrail refusal, context
    /// overflow) — omitting it (the "weak result" call site above) always
    /// proceeds. Returns `nil` whenever the fallback isn't available or itself
    /// fails, so callers fall through to whatever result or error they already have.
    private func privateCloudFallback(
        _ privateCloud: () async throws -> MealEstimate,
        retryableAfter error: Error? = nil
    ) async -> MealEstimate? {
        guard isPrivateCloudComputeAvailable else { return nil }
        if let error, !Self.isRetryableOnPrivateCloud(error) { return nil }
        do {
            return try await privateCloud()
        } catch {
            // Reported rather than swallowed — the caller still degrades
            // gracefully to its own result/error, but a silent PCC failure
            // would otherwise be invisible in production.
            ErrorReporter.captureWarning(
                "Private Cloud Compute meal estimate failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            return nil
        }
    }

    #if canImport(FoundationModels)

    // Not `private`: `MealEstimatorPrivateCloud.swift` reuses `instructions`,
    // `makeSearchClosure()` and `mapGenerationError` for the Private Cloud
    // Compute fallback, and `FoodSearchTool`/`EstimatedMeal`/`MatchedFoodIds`/
    // `FoodMatchDTO` below for the same reason — same tool, same guard, same
    // guided-generation shape, just a different model backing the session.

    @available(iOS 26.0, *)
    static let instructions = """
    You are a nutrition assistant helping a user log a meal they just described. \
    For each distinct food or drink item mentioned, call the searchLocalFoods tool \
    once to look for a matching food in the user's personal food database. Prefer a \
    matched food when it is clearly the same item; only set matchedFoodId to an id \
    that the tool actually returned, and only when you are confident it's the same \
    item. When you use a match, express the quantity as a number of servings of that \
    food, using the serving size and unit the tool result gives you. When there is no \
    good match, estimate realistic European portion sizes and report calories in kcal \
    and protein, carbs, fat and fiber in grams. Write each item's name in the same \
    language the user described their meal in.

    \(MealEstimator.estimationRules)
    """

    /// Appended to both the text and the photo instructions
    /// (`MealEstimator+Photo.swift`). The per-100 g anchors are what keep a
    /// small model from reporting 180 g of protein for 240 g of beef; the
    /// dish rule is what keeps it from listing a burrito bowl and then every
    /// ingredient of it again. `MealEstimateValidator` and
    /// `MealEstimateDeduplicator` re-check both after generation.
    static let estimationRules = """
    Rules for every number you report:
    - All values (grams, calories, protein, carbs, fat, fiber) are for the whole stated \
    portion, never per 100 g. First decide the portion's weight in grams, then derive the \
    macros from that weight.
    - Protein + carbs + fat + fiber in grams can never add up to more than the portion \
    weighs. Meat, fish, dairy, fruit and vegetables are mostly water.
    - Calories are about 4 x protein + 4 x carbs + 9 x fat. No food has more than 9 kcal \
    per gram.
    - Typical values per 100 g: raw lean ground beef (7% fat) 150 kcal, 21 g protein, 7 g \
    fat; chicken breast 120 kcal, 23 g protein, 2 g fat; salmon 200 kcal, 20 g protein, \
    13 g fat; egg 145 kcal, 12.5 g protein, 10 g fat (one egg is about 55 g); cooked rice \
    or pasta 130 to 160 kcal, 3 to 5 g protein, 28 to 31 g carbs, 1 g fat; bread 260 kcal, \
    9 g protein, 49 g carbs, 3 g fat; cooked beans 120 kcal, 8 g protein, 20 g carbs; \
    potatoes 80 kcal, 2 g protein, 17 g carbs; vegetables 20 to 50 kcal; fruit 40 to 90 \
    kcal; cheese 300 to 400 kcal, 25 g protein, 30 g fat; nuts 600 kcal, 20 g protein, \
    50 g fat; butter and oil 720 to 900 kcal, 80 to 100 g fat; milk 45 to 65 kcal.
    - A dish made of several things is either ONE item for the whole dish, or one item \
    per ingredient, never both. When the user lists the ingredients (for example "burrito \
    bowl with rice, black beans, chicken and salsa"), return only the ingredients as \
    separate items and no item for the dish itself. When the user names a dish without \
    ingredients, return a single item for the whole dish. Sides and drinks named next to \
    a dish ("with fries and a cola") stay separate items.
    """

    @available(iOS 26.0, *)
    private func makeSession(matchedIds: MatchedFoodIds, usesTools: Bool = true) -> LanguageModelSession {
        guard usesTools else {
            return LanguageModelSession(instructions: Self.instructions)
        }
        let tool = FoodSearchTool(search: makeSearchClosure(), matchedIds: matchedIds)
        return LanguageModelSession(tools: [tool], instructions: Self.instructions)
    }

    /// Not private: `MealEstimator+Photo.swift` builds its own tool from this
    /// closure to add multimodal (photo) support without duplicating the food
    /// search logic or its hallucination guard.
    @available(iOS 26.0, *)
    func makeSearchClosure() -> @Sendable (String) async -> [FoodMatchDTO] {
        let foodRepository = foodRepository
        return { query in
            // Hops back to the main actor to read SwiftData, then converts to a
            // Sendable DTO before returning across the tool-call boundary.
            await foodRepository.searchLocal(query, limit: 5).map(FoodMatchDTO.init)
        }
    }

    /// Retries a decoding failure and an implausible answer (see
    /// `MealEstimateGeneration`) and returns the validated result; the
    /// Private Cloud Compute and photo paths wrap their own model calls in
    /// the same policy.
    @available(iOS 26.0, *)
    private func estimateWithFoundationModels(description: String) async throws -> MealEstimate {
        try await MealEstimateGeneration.run(description: description) { attempt in
            try await generateOnDevice(prompt: attempt.prompt(for: description), usesTools: attempt.usesTools)
        }
    }

    @available(iOS 26.0, *)
    private func generateOnDevice(prompt: String, usesTools: Bool) async throws -> MealEstimate {
        let matchedIds = MatchedFoodIds()
        let session = makeSession(matchedIds: matchedIds, usesTools: usesTools)
        do {
            let response = try await session.respond(to: prompt, generating: EstimatedMeal.self)
            return await Self.estimate(from: response.content, matchedIds: matchedIds, source: .onDevice)
        } catch let error as LanguageModelSession.GenerationError {
            throw Self.mapGenerationError(error)
        } catch {
            throw MealEstimatorError.generationFailed(error.localizedDescription)
        }
    }

    /// The raw, not yet validated estimate for a generated meal, with the
    /// hallucination guard applied to every matched food id. Not private:
    /// shared by the Private Cloud Compute and photo paths.
    @available(iOS 26.0, *)
    static func estimate(
        from meal: EstimatedMeal,
        matchedIds: MatchedFoodIds,
        source: MealEstimateSource
    ) async -> MealEstimate {
        let validIds = await matchedIds.ids
        let items = meal.items.map { item in
            MealEstimateItem.fromGenerated(
                name: item.name,
                matchedFoodId: item.matchedFoodId,
                quantityDescription: item.quantityDescription,
                grams: item.grams,
                servings: item.servings,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                fiber: item.fiber,
                confidence: item.confidence,
                validMatchedFoodIds: validIds
            )
        }
        return MealEstimate(items: items, source: source)
    }

    /// Not private: reused by `MealEstimator+Photo.swift` for the photo path's errors.
    @available(iOS 26.0, *)
    static func mapGenerationError(_ error: LanguageModelSession.GenerationError) -> MealEstimatorError {
        switch error {
        case .guardrailViolation:
            .guardrailViolation
        case .exceededContextWindowSize:
            .contextWindowExceeded
        case .unsupportedLanguageOrLocale:
            .unsupportedLanguage
        case .decodingFailure:
            .decodingFailed
        default:
            .generationFailed(error.localizedDescription)
        }
    }

    #endif
}

#if canImport(FoundationModels)

/// Sendable snapshot of a `Food` handed to the model through the search tool —
/// crossing the tool-call boundary needs a plain value type, not the
/// `@MainActor`-bound `FoodRepository`/SwiftData row.
///
/// Not private: `MealEstimator+Photo.swift` shares this DTO (and the tool,
/// actor and error mapper below) rather than duplicating them for the photo path.
@available(iOS 26.0, *)
struct FoodMatchDTO {
    let id: String
    let name: String
    let brand: String?
    let caloriesPerServing: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let servingSize: Double
    let servingUnit: ServingUnit

    init(food: Food) {
        id = food.id
        name = food.name
        brand = food.brand
        caloriesPerServing = food.calories
        protein = food.protein
        carbs = food.carbs
        fat = food.fat
        fiber = food.fiber
        servingSize = food.servingSize
        servingUnit = food.servingUnit
    }
}

/// Thread-safe record of every food id the search tool has returned during a
/// session, so a matchedFoodId the model invents (rather than copies from a
/// tool result) can be detected and discarded after generation.
@available(iOS 26.0, *)
actor MatchedFoodIds {
    private(set) var ids: Set<String> = []

    func record(_ newIds: [String]) {
        ids.formUnion(newIds)
    }
}

@available(iOS 26.0, *)
struct FoodSearchTool: Tool {
    let name = "searchLocalFoods"
    let description = """
    Searches the user's personal food database by name and returns up to 5 candidate \
    matches with their id and macros per serving. Call this once for each distinct \
    food or drink item mentioned, using that item's name as the query.
    """

    let search: @Sendable (String) async -> [FoodMatchDTO]
    let matchedIds: MatchedFoodIds

    @Generable
    struct Arguments {
        @Guide(description: "The food or drink item to search for, e.g. \"greek yogurt\" or \"banana\"")
        let query: String
    }

    func call(arguments: Arguments) async throws -> String {
        let matches = await search(arguments.query)
        await matchedIds.record(matches.map(\.id))
        guard !matches.isEmpty else {
            return "No matches found in the local food database for \"\(arguments.query)\"."
        }
        let lines = matches.map { match -> String in
            var line = "id: \(match.id), name: \(match.name)"
            if let brand = match.brand {
                line += " (\(brand))"
            }
            line += ", per \(Int(match.servingSize)) \(match.servingUnit.displayName): "
            line += "\(Int(match.caloriesPerServing)) kcal, \(Int(match.protein))g protein, "
            line += "\(Int(match.carbs))g carbs, \(Int(match.fat))g fat, \(Int(match.fiber))g fiber"
            return line
        }
        return lines.joined(separator: "\n")
    }
}

@available(iOS 26.0, *)
@Generable
struct EstimatedMeal {
    @Guide(
        description: "One entry per distinct food or drink item mentioned in the user's description. A dish whose " +
            "ingredients are listed is returned as those ingredients only, never as the dish plus its ingredients.",
        .maximumCount(20)
    )
    let items: [EstimatedItem]
}

/// Properties are generated in declaration order, so the order here is the
/// order the model reasons in: portion weight first, then the macros that
/// weight can hold, and calories last so they can be added up from the macros
/// instead of being guessed before them. The numeric ranges are only a
/// backstop against runaway numbers; `MealEstimateValidator` does the real
/// plausibility checks. Optional properties carry no range guide, since
/// guides apply to the non-optional type.
@available(iOS 26.0, *)
@Generable
struct EstimatedItem {
    @Guide(description: "The food or drink item's name, written in the same language the user described it in")
    let name: String

    @Guide(
        description: "The id of a food returned by the searchLocalFoods tool, set ONLY if it exactly matches " +
            "this item. Leave unset if no tool result is a confident match."
    )
    let matchedFoodId: String?

    @Guide(description: "A short human-readable quantity, e.g. \"2 eggs\" or \"1 slice\"")
    let quantityDescription: String

    @Guide(
        description: "Weight of the full portion in grams (volume in ml for drinks). Decide this first; the " +
            "macros below must fit into it.",
        .range(0 ... 5000)
    )
    let grams: Double

    @Guide(description: "Number of servings of the matched food — only set this when matchedFoodId is set")
    let servings: Double?

    @Guide(
        description: "Protein in grams in the full portion, never more than the portion weighs",
        .range(0 ... 300)
    )
    let protein: Double

    @Guide(
        description: "Carbohydrates in grams in the full portion. Protein + carbs + fat + fiber together " +
            "weigh less than the portion.",
        .range(0 ... 600)
    )
    let carbs: Double

    @Guide(description: "Fat in grams in the full portion", .range(0 ... 300))
    let fat: Double

    @Guide(description: "Fiber in grams in the full portion", .range(0 ... 100))
    let fiber: Double

    @Guide(
        description: "Calories in kcal for the full portion, worked out last: about 4 x protein + 4 x carbs + " +
            "9 x fat",
        .range(0 ... 5000)
    )
    let calories: Double

    @Guide(description: "Confidence in this estimate, from 0 (rough guess) to 1 (certain)", .range(0 ... 1))
    let confidence: Double
}

#endif
