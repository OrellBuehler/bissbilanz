import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// On-device / Private Cloud Compute label suggestion for a food — the
/// general en_US nouns ("banana", "bottle") search, Spotlight and Visual
/// Intelligence match against (see `LabelNormalizer`, the server's
/// `LABEL_CONTRACT` in `src/lib/server/mcp/server.ts`). Backs the "Suggest
/// labels" button in `FoodEditSheet` and the unattended sweep
/// (`FoodAutoLabeler`, `LabelUnlabeledFoodsView`).
///
/// Routing is simpler than `MealEstimator`'s: labelling never retries a
/// result it already got — there's no per-label confidence to judge a result
/// "weak" by — it just prefers on-device Apple Intelligence when available
/// and falls back to Private Cloud Compute (`MealEstimatorPrivateCloud.swift`)
/// only when on-device isn't available at all.
enum FoodLabelerError: Error {
    case unavailable
    case generationFailed(String)

    var localizedMessage: String {
        switch self {
        case .unavailable:
            L10n.foodLabelUnavailable
        case let .generationFailed(message):
            message.isEmpty ? L10n.foodLabelGenerationError : message
        }
    }
}

/// What the labeller reads about a food to suggest labels for it — the same
/// fields `FoodEditSheet`'s form (or a saved `Food`) holds.
struct FoodLabelInput {
    var name: String
    var brand: String?
    var servingUnit: ServingUnit
    var ingredientsText: String?
}

@MainActor
@Observable
final class FoodLabeler {
    private let foodRepository: FoodRepository

    init(foodRepository: FoodRepository) {
        self.foodRepository = foodRepository
    }

    /// Whether `labels(for:)` can produce anything right now: on-device Apple
    /// Intelligence, or Private Cloud Compute as a fallback. Drives whether
    /// the "Suggest labels" button and the "Food labels" settings section
    /// show at all.
    var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability {
                return true
            }
        }
        #endif
        return isPrivateCloudComputeAvailable
    }

    /// Same composite check `MealEstimatorPrivateCloud.swift` uses for meal
    /// estimation: the user has left Private Cloud Compute turned on, and
    /// Apple currently authorizes it for this account/device.
    private var isPrivateCloudComputeAvailable: Bool {
        PrivateCloudComputeSettings.isEnabled && PrivateCloudComputeSettings.isSupported
    }

    /// Suggests labels for a food from its name, brand, serving unit and
    /// (truncated) ingredients text, reusing whatever vocabulary the local
    /// catalog already carries. The result is already normalized
    /// (`LabelNormalizer.normalizeAll`) — callers still merge it with any
    /// labels the food already has.
    func labels(for input: FoodLabelInput) async throws -> [String] {
        let prompt = Self.buildPrompt(for: input, vocabulary: foodRepository.mostUsedLocalLabels())

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability {
                do {
                    return try await labelsOnDevice(prompt: prompt)
                } catch {
                    ErrorReporter.captureWarning(
                        "On-device food labelling failed",
                        context: ["reason": ErrorReporter.reason(for: error)]
                    )
                    throw Self.wrap(error)
                }
            }
        }
        #endif

        guard isPrivateCloudComputeAvailable else {
            throw FoodLabelerError.unavailable
        }
        do {
            return try await labelsWithPrivateCloudCompute(prompt: prompt)
        } catch {
            ErrorReporter.captureWarning(
                "Private Cloud Compute food labelling failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            throw Self.wrap(error)
        }
    }

    /// Builds the prompt handed to the model: the food's own fields plus up
    /// to the 60 most-used labels already in the local catalog, so the model
    /// reuses existing vocabulary instead of inventing near-synonyms — the
    /// same idea as the MCP `label_foods` prompt's `list_labels` step
    /// (`src/lib/server/mcp/prompts.ts`). Pure and available on every
    /// platform/compiler, with or without Apple Intelligence — see
    /// `FoodLabelerTests`.
    static func buildPrompt(for input: FoodLabelInput, vocabulary: [String]) -> String {
        var lines = ["Food name: \(input.name)"]
        if let brand = input.brand, !brand.isEmpty {
            lines.append("Brand: \(brand)")
        }
        var servingLine = "Serving unit: \(input.servingUnit.displayName)"
        if input.servingUnit.isVolume {
            servingLine += " (a volume unit usually means this is a drink)"
        }
        lines.append(servingLine)
        if let ingredients = input.ingredientsText, !ingredients.isEmpty {
            lines.append("Ingredients: \(ingredients.prefix(300))")
        }
        if !vocabulary.isEmpty {
            lines.append(
                "Labels already used elsewhere in this food database — reuse one of these " +
                    "instead of a near-synonym where it accurately applies: \(vocabulary.joined(separator: ", "))"
            )
        }
        return lines.joined(separator: "\n")
    }

    private static func wrap(_ error: Error) -> FoodLabelerError {
        if let error = error as? FoodLabelerError { return error }
        return .generationFailed(error.localizedDescription)
    }

    /// Private Cloud Compute fallback, gated the same two-layer way
    /// `MealEstimatorPrivateCloud.swift` gates `estimateWithPrivateCloudCompute`:
    /// `PrivateCloudComputeLanguageModel` and the `LanguageModelSession.init(
    /// model:instructions:)` overload it needs are new in the Xcode 27 SDK, so
    /// this stays callable (and simply unavailable) on older SDKs/OS versions.
    private func labelsWithPrivateCloudCompute(prompt: String) async throws -> [String] {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            return try await labelsWithPCCModel(prompt: prompt)
        }
        #endif
        throw FoodLabelerError.unavailable
    }

    #if canImport(FoundationModels)

    // Not private: the Private Cloud Compute extension below reuses
    // `instructions` for the same tool-free, guided-generation prompt, just a
    // different model backing the session.
    @available(iOS 26.0, *)
    static let instructions = """
    You are labelling a food in the user's personal food database so it can be found by an \
    English-language search or by pointing a camera at it (Visual Intelligence). For the food \
    described below, return 3 to 8 general English (en_US) nouns describing what it physically \
    IS or visibly contains, as a camera would see it. Use singular, lowercase, everyday terms - \
    banana, bread, cheese, bottle, salad. Do NOT use brand names, product names, nutrition \
    terms, cuisines, or adjectives. Prefer the concrete object over the category, but include \
    one broader term where it is natural (banana, fruit). Always English, whatever language the \
    food is named in: a food called "Banane" is still labelled "banana".

    Conventions to follow:
    - A canned or bottled drink also gets a container label - drink, can, bottle, cup, or jar, \
    whichever actually applies.
    - A cola-flavored soda gets both "soda" and "cola". A mate-based tea gets both "tea" and "mate".
    - Bread gets "bread" plus the more specific form where it applies - toast, slice, loaf, roll, bun.
    - Cheese gets "cheese" plus the specific variety, e.g. "cheddar" or "mozzarella".
    - Meat gets "meat" plus the specific animal, e.g. "beef" or "chicken".
    """

    @available(iOS 26.0, *)
    private func labelsOnDevice(prompt: String) async throws -> [String] {
        let session = LanguageModelSession(instructions: Self.instructions)
        let response = try await session.respond(to: prompt, generating: GeneratedFoodLabels.self)
        return LabelNormalizer.normalizeAll(response.content.labels)
    }

    #endif
}

#if compiler(>=6.4) && canImport(FoundationModels)

@available(iOS 27, *)
private extension FoodLabeler {
    func labelsWithPCCModel(prompt: String) async throws -> [String] {
        let session = LanguageModelSession(
            model: PrivateCloudComputeLanguageModel(),
            instructions: Self.instructions
        )
        let response = try await session.respond(to: prompt, generating: GeneratedFoodLabels.self)
        return LabelNormalizer.normalizeAll(response.content.labels)
    }
}

#endif

#if canImport(FoundationModels)

@available(iOS 26.0, *)
@Generable
struct GeneratedFoodLabels {
    @Guide(
        description: "3 to 8 general English (en_US) nouns describing what the food physically is or visibly " +
            "contains, singular and lowercase",
        .count(1 ... 8)
    )
    let labels: [String]
}

#endif
