import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Private Cloud Compute fallback for `MealEstimator`: when the on-device
/// model is unavailable, refuses, overflows its context window, or comes back
/// obviously weak, `MealEstimator.estimate(description:)` retries the same
/// tool-augmented, `@Generable`-guided prompt on Apple's server model instead
/// of just failing. See `MealEstimator.swift` for the on-device path this
/// mirrors and the call sites that use this file.
///
/// `PrivateCloudComputeLanguageModel` and the `LanguageModelSession.init(
/// model:tools:instructions:)` overload it needs are new in the Xcode 27 SDK
/// (iOS 27 / watchOS 27 — WWDC26 "What's new in the Foundation Models
/// framework" / "Build with the new Apple Foundation Model on Private Cloud
/// Compute" / "Bring an LLM provider to the Foundation Models framework"), so
/// this needs `#if compiler(>=6.4)` layered on top of
/// `canImport(FoundationModels)` — the same two-layer gate `SiriIOS27.swift`
/// uses, and for the same reason: the Swift CodeQL job still builds against
/// an Xcode whose FoundationModels module predates these symbols.
///
/// **Entitlement**: Apple gates `PrivateCloudComputeLanguageModel` behind the
/// managed `com.apple.developer.private-cloud-compute` entitlement, which is
/// granted per developer account on request (enrollment in the App Store
/// Small Business Program, under 2M first-time downloads across the
/// account's apps). This project does not have that entitlement, and nothing
/// here adds it to `Bissbilanz.entitlements` / `BissbilanzWatch.entitlements`
/// — that's a business decision for the account holder, not a code change.
/// Without it, `PrivateCloudComputeLanguageModel().isAvailable` simply
/// reports `false`, exactly like any other ineligible device, so both this
/// fallback and the watch's voice-logging entry point (`WatchMealEstimator`)
/// quietly stay off until the account is enrolled and the entitlement is
/// requested and added to both entitlements files.
extension MealEstimator {
    /// Whether the Private Cloud Compute fallback could run right now: the
    /// user has left it turned on, the OS supports it, and Apple currently
    /// authorizes this account/device — which folds in the entitlement above,
    /// Apple Intelligence region rules and iCloud sign-in, the same kind of
    /// composite check `SystemLanguageModel.availability` does for the
    /// on-device model.
    var isPrivateCloudComputeAvailable: Bool {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            return PrivateCloudComputeSettings.isEnabled && PrivateCloudComputeLanguageModel().isAvailable
        }
        #endif
        return false
    }

    /// Whether an estimate can be produced at all, on-device or via Private
    /// Cloud Compute. Drives whether `AIMealSheet` shows the estimate action,
    /// so a device without Apple Intelligence but with PCC access isn't left
    /// with only the "send to my assistant" queue.
    var canEstimate: Bool {
        availability == .available || isPrivateCloudComputeAvailable
    }

    /// Runs the same tool-augmented, hallucination-guarded estimate as the
    /// on-device path, backed by `PrivateCloudComputeLanguageModel` instead of
    /// `SystemLanguageModel`. Callers should check `isPrivateCloudComputeAvailable`
    /// first — `MealEstimator.estimate(description:)` is the entry point that
    /// actually decides when to call this.
    func estimateWithPrivateCloudCompute(description: String) async throws -> MealEstimate {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            return try await estimateWithPCCModel(description: description)
        }
        #endif
        throw MealEstimatorError.generationFailed(L10n.aiMealOsUnsupported)
    }

    /// A result counts as "obviously weak" when the model found nothing, or
    /// found items but wasn't confident about any single one of them — the
    /// same 0.5 cutoff `AIMealReviewView` already flags one row with, applied
    /// here to the whole result.
    static func isWeakEstimate(_ estimate: MealEstimate) -> Bool {
        guard !estimate.items.isEmpty else { return true }
        return estimate.items.allSatisfy { $0.confidence < 0.5 }
    }

    /// Only the two on-device failures the fallback is meant to catch: a
    /// guardrail refusal and a context-window overflow. A generic generation
    /// failure or an unsupported language most likely isn't something a
    /// bigger model fixes, so those still surface to the user as before.
    static func isRetryableOnPrivateCloud(_ error: Error) -> Bool {
        guard let error = error as? MealEstimatorError else { return false }
        switch error {
        case .guardrailViolation, .contextWindowExceeded:
            return true
        case .unsupportedLanguage, .generationFailed:
            return false
        }
    }
}

#if compiler(>=6.4) && canImport(FoundationModels)

@available(iOS 27, *)
private extension MealEstimator {
    func estimateWithPCCModel(description: String) async throws -> MealEstimate {
        let matchedIds = MatchedFoodIds()
        let tool = FoodSearchTool(search: makeSearchClosure(), matchedIds: matchedIds)
        let session = LanguageModelSession(
            model: PrivateCloudComputeLanguageModel(),
            tools: [tool],
            instructions: Self.instructions
        )
        do {
            let response = try await session.respond(to: description, generating: EstimatedMeal.self)
            let validIds = await matchedIds.ids
            let items = response.content.items.map { item -> MealEstimateItem in
                // Same hallucination guard as the on-device path: drop any
                // matchedFoodId the tool never actually returned.
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
            return MealEstimate(items: items, source: .privateCloudCompute)
        } catch let error as LanguageModelSession.GenerationError {
            throw MealEstimator.mapGenerationError(error)
        } catch {
            throw MealEstimatorError.generationFailed(error.localizedDescription)
        }
    }
}

#endif

/// Device-local (not synced to the account) toggle for whether an AI estimate
/// may leave the device at all for Apple's Private Cloud Compute. Backs
/// `SettingsView`'s "AI Estimation" toggle and also gates the Apple Watch
/// voice-logging entry point (`WatchMealEstimator`), which has no on-device
/// model to fall back from — PCC is its only option, so turning this off also
/// hides that entry point once the setting next reaches the watch.
///
/// Local like `selected_tabs`/the supplement-snooze duration in
/// `SettingsView`: whether *this* device is allowed to hand a meal
/// description to Apple's cloud is a property of the device's own privacy
/// posture, not the account.
///
/// Defaults to on: Private Cloud Compute carries the same no-retention,
/// independently-verifiable privacy guarantees Apple already relies on for
/// on-device Apple Intelligence features, this fallback only ever fires when
/// on-device estimation already failed or came back weak, and the app
/// already sends the same kind of free-text meal description off-device today
/// via "send to my assistant" (`AIMealSheet`) with no equivalent toggle at
/// all — this merely gives the AI estimate button a comparably-private way to
/// still succeed instead of a dead end.
enum PrivateCloudComputeSettings {
    private static let key = "private_cloud_compute_enabled"

    static var isEnabled: Bool {
        get {
            guard UserDefaults.standard.object(forKey: key) != nil else { return true }
            return UserDefaults.standard.bool(forKey: key)
        }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
