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
/// `.osUnsupported`. A queue-based fallback for non-eligible devices is a
/// later PR — this type is the seam for it.
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
    case generationFailed(String)

    var localizedMessage: String {
        switch self {
        case .guardrailViolation:
            L10n.aiMealGuardrailError
        case .contextWindowExceeded:
            L10n.aiMealContextWindowError
        case .unsupportedLanguage:
            L10n.aiMealUnsupportedLanguageError
        case let .generationFailed(message):
            message.isEmpty ? L10n.aiMealGenerationError : message
        }
    }
}

/// Plain result types, available on every OS version/compiler this project
/// builds with — only the code that produces them is gated.
struct MealEstimate {
    var items: [MealEstimateItem]
}

struct MealEstimateItem: Identifiable {
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
            makeSession().prewarm()
        }
        #endif
    }

    func estimate(description: String) async throws -> MealEstimate {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return try await estimateWithFoundationModels(description: description)
        }
        #endif
        throw MealEstimatorError.generationFailed(L10n.aiMealOsUnsupported)
    }

    #if canImport(FoundationModels)

    @available(iOS 26.0, *)
    private static let instructions = """
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
    """

    @available(iOS 26.0, *)
    private func makeSession() -> LanguageModelSession {
        let tool = FoodSearchTool(search: makeSearchClosure(), matchedIds: MatchedFoodIds())
        return LanguageModelSession(tools: [tool], instructions: Self.instructions)
    }

    @available(iOS 26.0, *)
    private func makeSearchClosure() -> @Sendable (String) async -> [FoodMatchDTO] {
        let foodRepository = foodRepository
        return { query in
            // Hops back to the main actor to read SwiftData, then converts to a
            // Sendable DTO before returning across the tool-call boundary.
            await foodRepository.searchLocal(query, limit: 5).map(FoodMatchDTO.init)
        }
    }

    @available(iOS 26.0, *)
    private func estimateWithFoundationModels(description: String) async throws -> MealEstimate {
        let matchedIds = MatchedFoodIds()
        let tool = FoodSearchTool(search: makeSearchClosure(), matchedIds: matchedIds)
        let session = LanguageModelSession(tools: [tool], instructions: Self.instructions)
        do {
            let response = try await session.respond(to: description, generating: EstimatedMeal.self)
            let validIds = await matchedIds.ids
            let items = response.content.items.map { item -> MealEstimateItem in
                // Hallucination guard: drop any matchedFoodId the tool never
                // actually returned, so a fabricated id can't slip through.
                let matchedFoodId = item.matchedFoodId.flatMap { validIds.contains($0) ? $0 : nil }
                return MealEstimateItem(
                    name: item.name,
                    matchedFoodId: matchedFoodId,
                    quantityDescription: item.quantityDescription,
                    grams: item.grams,
                    servings: matchedFoodId != nil ? item.servings : nil,
                    calories: item.calories,
                    protein: item.protein,
                    carbs: item.carbs,
                    fat: item.fat,
                    fiber: item.fiber,
                    confidence: item.confidence
                )
            }
            return MealEstimate(items: items)
        } catch let error as LanguageModelSession.GenerationError {
            throw Self.mapGenerationError(error)
        } catch {
            throw MealEstimatorError.generationFailed(error.localizedDescription)
        }
    }

    @available(iOS 26.0, *)
    private static func mapGenerationError(_ error: LanguageModelSession.GenerationError) -> MealEstimatorError {
        switch error {
        case .guardrailViolation:
            .guardrailViolation
        case .exceededContextWindowSize:
            .contextWindowExceeded
        case .unsupportedLanguageOrLocale:
            .unsupportedLanguage
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
@available(iOS 26.0, *)
private struct FoodMatchDTO {
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
private actor MatchedFoodIds {
    private(set) var ids: Set<String> = []

    func record(_ newIds: [String]) {
        ids.formUnion(newIds)
    }
}

@available(iOS 26.0, *)
private struct FoodSearchTool: Tool {
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
private struct EstimatedMeal {
    @Guide(description: "One entry per distinct food or drink item mentioned in the user's description")
    let items: [EstimatedItem]
}

@available(iOS 26.0, *)
@Generable
private struct EstimatedItem {
    @Guide(description: "The food or drink item's name, written in the same language the user described it in")
    let name: String

    @Guide(
        description: "The id of a food returned by the searchLocalFoods tool, set ONLY if it exactly matches " +
            "this item. Leave unset if no tool result is a confident match."
    )
    let matchedFoodId: String?

    @Guide(description: "A short human-readable quantity, e.g. \"2 eggs\" or \"1 slice\"")
    let quantityDescription: String

    @Guide(description: "Estimated weight in grams for the full quantity, if it can be reasonably estimated")
    let grams: Double?

    @Guide(description: "Number of servings of the matched food — only set this when matchedFoodId is set")
    let servings: Double?

    @Guide(description: "Estimated calories in kcal for the full quantity described")
    let calories: Double

    @Guide(description: "Estimated protein in grams for the full quantity described")
    let protein: Double

    @Guide(description: "Estimated carbohydrates in grams for the full quantity described")
    let carbs: Double

    @Guide(description: "Estimated fat in grams for the full quantity described")
    let fat: Double

    @Guide(description: "Estimated fiber in grams for the full quantity described")
    let fiber: Double

    @Guide(description: "Confidence in this estimate, from 0 (rough guess) to 1 (certain)", .range(0 ... 1))
    let confidence: Double
}

#endif
