import Foundation
import UIKit
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
/// "weak" by. Which of on-device, Private Cloud Compute or neither runs is
/// decided by `FoodLabelProviderSettings.selected` (`isAvailable` and
/// `labels(for:)` both switch on it); "Automatic" is the only case that
/// mirrors the old fixed routing (on-device first, Private Cloud Compute as
/// the fallback). When the food has a photo and the OS supports attaching one
/// to a Foundation Models prompt (iOS 27, same gate `MealEstimator+Photo.swift`
/// uses), it's sent along too — see `attachableImage(for:)`.
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
    /// The food's photo, loaded via `FoodImageLoader`, when it has one.
    /// Attached to the prompt on OS versions that support it — see
    /// `FoodLabeler.attachableImage(for:)` — and otherwise simply ignored, so
    /// callers can always pass whatever `FoodImageLoader.image(for:)`
    /// returned without checking availability themselves.
    var image: UIImage?
}

/// Which model(s) `FoodLabeler` is allowed to use, chosen in `SettingsView`'s
/// "Food Labels" section (`FoodLabelProviderSettings`) and respected by
/// `FoodLabeler.isAvailable`/`labels(for:)`, `FoodAutoLabeler`'s unattended
/// sweep, and `LabelUnlabeledFoodsView`'s bulk sweep.
enum FoodLabelProvider: String, CaseIterable {
    /// On-device Apple Intelligence first, Private Cloud Compute as a
    /// fallback when on-device isn't available — the original, and still
    /// default, behavior.
    case automatic
    /// On-device Apple Intelligence only; never leaves the device.
    case onDeviceOnly = "on_device"
    /// Private Cloud Compute only, even when on-device is available.
    case privateCloudCompute = "private_cloud"
    /// Neither: labelling is left entirely to a connected AI assistant (MCP),
    /// the same way the app already leaves logging itself to one.
    case mcp
}

/// Device-local (not synced to the account) choice of which labeller
/// `FoodLabeler` uses. Local like `PrivateCloudComputeSettings`/
/// `FoodAutoLabelSettings`: which model(s) this device is allowed to run
/// suggestions through is a property of the device/account, not something
/// that follows the user to another one.
enum FoodLabelProviderSettings {
    private static let key = "food_label_provider"

    static var selected: FoodLabelProvider {
        get {
            guard let raw = UserDefaults.standard.string(forKey: key),
                  let provider = FoodLabelProvider(rawValue: raw)
            else { return .automatic }
            return provider
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }
}

@MainActor
@Observable
final class FoodLabeler {
    private let foodRepository: FoodRepository

    init(foodRepository: FoodRepository) {
        self.foodRepository = foodRepository
    }

    /// Whether `labels(for:)` can produce anything right now, given the
    /// selected `FoodLabelProviderSettings.selected`. Drives whether the
    /// "Suggest labels" button, and the auto-label toggle/"Label Unlabeled
    /// Foods" row in `SettingsView`, show at all.
    var isAvailable: Bool {
        switch FoodLabelProviderSettings.selected {
        case .automatic:
            isOnDeviceAvailable || isPrivateCloudComputeAvailable
        case .onDeviceOnly:
            isOnDeviceAvailable
        case .privateCloudCompute:
            isPrivateCloudComputeAvailable
        case .mcp:
            // Deliberately not "connected" — choosing this provider means
            // leaving labelling to the assistant, whether or not one happens
            // to be connected right now.
            false
        }
    }

    /// Whether the "Food Labels" section in `SettingsView` has anything
    /// worth showing at all: a provider to pick even before one is
    /// selected/available, which `isAvailable` alone can't answer once the
    /// user has chosen "AI assistant (MCP)" (always unavailable by design)
    /// or a provider this device doesn't support.
    var deviceCapableOfLabeling: Bool {
        isOnDeviceAvailable || PrivateCloudComputeSettings.isSupported
    }

    /// Whether on-device Apple Intelligence can produce a result right now,
    /// independent of the selected provider.
    private var isOnDeviceAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability {
                return true
            }
        }
        #endif
        return false
    }

    /// Same composite check `MealEstimatorPrivateCloud.swift` uses for meal
    /// estimation: the user has left Private Cloud Compute turned on, and
    /// Apple currently authorizes it for this account/device.
    private var isPrivateCloudComputeAvailable: Bool {
        PrivateCloudComputeSettings.isEnabled && PrivateCloudComputeSettings.isSupported
    }

    /// Suggests labels for a food from its name, brand, serving unit,
    /// (truncated) ingredients text and — when there is one and the OS
    /// supports attaching it — its photo, reusing whatever vocabulary the
    /// local catalog already carries. Routes to on-device Apple Intelligence
    /// and/or Private Cloud Compute according to
    /// `FoodLabelProviderSettings.selected`; throws `.unavailable` when the
    /// selected provider is "AI assistant (MCP)" or isn't usable right now.
    /// The result is already normalized (`LabelNormalizer.normalizeAll`) —
    /// callers still merge it with any labels the food already has.
    func labels(for input: FoodLabelInput) async throws -> [String] {
        let prompt = Self.buildPrompt(for: input, vocabulary: foodRepository.mostUsedLocalLabels())
        let image = attachableImage(for: input)
        let provider = FoodLabelProviderSettings.selected

        guard provider != .mcp else {
            throw FoodLabelerError.unavailable
        }

        if provider != .privateCloudCompute {
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                if case .available = SystemLanguageModel.default.availability {
                    do {
                        return try await labelsOnDevice(prompt: prompt, image: image)
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
        }

        guard provider != .onDeviceOnly, isPrivateCloudComputeAvailable else {
            throw FoodLabelerError.unavailable
        }
        do {
            return try await labelsWithPrivateCloudCompute(prompt: prompt, image: image)
        } catch {
            ErrorReporter.captureWarning(
                "Private Cloud Compute food labelling failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            throw Self.wrap(error)
        }
    }

    /// The food's photo, ready to attach to a Foundation Models prompt — nil
    /// unless the input has one *and* image prompts are supported here (iOS
    /// 27, `#if compiler(>=6.4)`, the same gate `MealEstimator+Photo.swift`
    /// uses for `Attachment`), so `labelsOnDevice`/the Private Cloud Compute
    /// path below don't each need their own version of this check.
    private func attachableImage(for input: FoodLabelInput) -> CGImage? {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            return input.image?.flattenedForModelInput().cgImage
        }
        #endif
        return nil
    }

    /// Builds the prompt handed to the model: the food's own fields plus up
    /// to the 60 most-used labels already in the local catalog, so the model
    /// reuses existing vocabulary instead of inventing near-synonyms — the
    /// same idea as the MCP `label_foods` prompt's `list_labels` step
    /// (`src/lib/server/mcp/prompts.ts`). Pure and available on every
    /// platform/compiler, with or without Apple Intelligence — see
    /// `FoodLabelerTests`.
    ///
    /// `nonisolated`: a pure function of its arguments with no access to
    /// `FoodLabeler`'s own state — without this it inherits the class's
    /// `@MainActor` isolation like every other member here, which is correct
    /// for the instance members but makes this uncallable from a plain
    /// synchronous context, including the unit tests (same reasoning as
    /// `MealEstimatorPrivateCloud.swift`'s `isWeakEstimate`).
    nonisolated static func buildPrompt(for input: FoodLabelInput, vocabulary: [String]) -> String {
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
    private func labelsWithPrivateCloudCompute(prompt: String, image: CGImage?) async throws -> [String] {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            return try await labelsWithPCCModel(prompt: prompt, image: image)
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
    private func labelsOnDevice(prompt: String, image: CGImage?) async throws -> [String] {
        let session = LanguageModelSession(instructions: Self.instructions)
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *), let image {
            let response = try await session.respond(generating: GeneratedFoodLabels.self) {
                prompt
                Attachment(image)
            }
            return LabelNormalizer.normalizeAll(response.content.labels)
        }
        #endif
        let response = try await session.respond(to: prompt, generating: GeneratedFoodLabels.self)
        return LabelNormalizer.normalizeAll(response.content.labels)
    }

    #endif
}

#if compiler(>=6.4) && canImport(FoundationModels)

@available(iOS 27, *)
private extension FoodLabeler {
    func labelsWithPCCModel(prompt: String, image: CGImage?) async throws -> [String] {
        let session = LanguageModelSession(
            model: PrivateCloudComputeLanguageModel(),
            instructions: Self.instructions
        )
        if let image {
            let response = try await session.respond(generating: GeneratedFoodLabels.self) {
                prompt
                Attachment(image)
            }
            return LabelNormalizer.normalizeAll(response.content.labels)
        }
        let response = try await session.respond(to: prompt, generating: GeneratedFoodLabels.self)
        return LabelNormalizer.normalizeAll(response.content.labels)
    }
}

/// Redraws the image upright so `Attachment(_ image: CGImage)` doesn't need an
/// orientation told to it explicitly — the same technique
/// `MealEstimator+Photo.swift` uses for camera captures. A food photo is
/// already downscaled and square-cropped on upload (`FoodImageField`), so
/// this only has to flatten orientation, not resize. Not itself version-gated
/// (`UIGraphicsImageRenderer` predates iOS 27) — only textually grouped with
/// the `Attachment`-using code above that's the only caller.
private extension UIImage {
    func flattenedForModelInput() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
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
