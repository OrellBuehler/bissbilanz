import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Meal estimation for the watch's voice-logging flow (`VoiceMealLogView`).
///
/// watchOS never runs Apple Intelligence's on-device model —
/// `SystemLanguageModel` is `@available(watchOS, unavailable)` — but watchOS
/// 27 brings the `FoundationModels` framework to the watch anyway, backed
/// exclusively by Apple's server model, `PrivateCloudComputeLanguageModel`
/// (WWDC26 "What's new in the Foundation Models framework" / "Build with the
/// new Apple Foundation Model on Private Cloud Compute"). So unlike the
/// phone's `MealEstimator`, there is no on-device path to fall back from here
/// — Private Cloud Compute is the only option, and `availability` reports
/// whether it's currently usable at all.
///
/// Mirrors the phone's two-layer gate (`MealEstimatorPrivateCloud.swift`):
/// `#if compiler(>=6.4)` because `PrivateCloudComputeLanguageModel` and the
/// `model:`-taking `LanguageModelSession` initializer are new in the Xcode 27
/// SDK, on top of `canImport(FoundationModels)` because the framework itself
/// doesn't exist on watchOS before 27.
///
/// **Entitlement**: like the phone fallback, this needs the managed
/// `com.apple.developer.private-cloud-compute` entitlement, which this
/// project does not have (see `MealEstimatorPrivateCloud.swift`). Without it,
/// `isAvailable` reports `false` and `LogListView` hides the voice-log entry
/// point entirely — no crash, just an inert feature until the account is
/// enrolled and the entitlement is added to `BissbilanzWatch.entitlements`.
///
/// No local food database exists on the watch, so unlike the phone there is
/// no search tool — the model estimates a single combined quick-log entry
/// (name + macros) rather than itemized, food-matched results.
enum WatchMealEstimatorAvailability: Equatable {
    case available
    case unavailable
    case osUnsupported
}

/// A single quick-log-style estimate: name plus macros, matching the shape
/// `WatchLogRequest`'s `quick*` fields already expect (see `VoiceMealLogView`).
struct WatchMealEstimate {
    var name: String
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double
}

enum WatchMealEstimatorError: Error {
    // `LanguageModelSession.GenerationError` — which the phone's on-device path
    // pattern-matches for a guardrail/context-overflow-specific message — is
    // unavailable on watchOS, so there's nothing to distinguish a refusal from
    // any other failure beyond the underlying error's own description.
    case generationFailed(String)

    func localizedMessage(_ strings: WatchStrings) -> String {
        switch self {
        case let .generationFailed(message):
            message.isEmpty ? strings.voiceLogFailed : message
        }
    }
}

@MainActor
@Observable
final class WatchMealEstimator {
    var availability: WatchMealEstimatorAvailability {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(watchOS 27, *) {
            return PrivateCloudComputeLanguageModel().isAvailable ? .available : .unavailable
        }
        #endif
        return .osUnsupported
    }

    func estimate(description: String) async throws -> WatchMealEstimate {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(watchOS 27, *) {
            return try await estimateWithPCCModel(description: description)
        }
        #endif
        throw WatchMealEstimatorError.generationFailed("")
    }

    #if compiler(>=6.4) && canImport(FoundationModels)

    @available(watchOS 27, *)
    private static let instructions = """
    You are a nutrition assistant helping a user log a meal they just described by \
    voice on their Apple Watch. Estimate realistic European portion sizes for the \
    whole meal as a single combined entry: a short name and total calories in kcal, \
    protein, carbs, fat and fiber in grams. Write the name in the same language the \
    user described their meal in.
    """

    @available(watchOS 27, *)
    private func estimateWithPCCModel(description: String) async throws -> WatchMealEstimate {
        let session = LanguageModelSession(
            model: PrivateCloudComputeLanguageModel(),
            tools: [],
            instructions: Self.instructions
        )
        do {
            let response = try await session.respond(to: description, generating: EstimatedWatchMeal.self)
            let item = response.content
            return WatchMealEstimate(
                name: item.name,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                fiber: item.fiber
            )
        } catch {
            // `LanguageModelSession.GenerationError` (which the phone's on-device
            // path pattern-matches for a guardrail/context-overflow-specific
            // message) is unavailable on watchOS — it doesn't exist in the
            // watchOS FoundationModels module at all, so there's nothing to
            // switch on here beyond the error's own description.
            throw WatchMealEstimatorError.generationFailed(error.localizedDescription)
        }
    }

    #endif
}

#if compiler(>=6.4) && canImport(FoundationModels)

@available(watchOS 27, *)
@Generable
private struct EstimatedWatchMeal {
    @Guide(description: "A short name for the whole meal, in the same language it was described in")
    let name: String

    @Guide(description: "Estimated total calories in kcal for the whole meal described")
    let calories: Double

    @Guide(description: "Estimated total protein in grams for the whole meal described")
    let protein: Double

    @Guide(description: "Estimated total carbohydrates in grams for the whole meal described")
    let carbs: Double

    @Guide(description: "Estimated total fat in grams for the whole meal described")
    let fat: Double

    @Guide(description: "Estimated total fiber in grams for the whole meal described")
    let fiber: Double
}

#endif
