import Foundation
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Meal estimation from one or more photos (plus optional text), added on top
/// of the text-only path in `MealEstimator.swift`. Routes through the same
/// `estimateWithFallback` as the text path: on-device first, Apple's Private
/// Cloud Compute model (which also takes image attachments) when on-device is
/// unavailable, refuses, overflows, or comes back weak.
///
/// Foundation Models gained multimodal (image) prompts in iOS 27 — `Attachment`
/// and `ImageAttachmentContent` are new API surface the Xcode 27 SDK declares,
/// so referencing them needs the same two-level gate as
/// `Intents/SiriIOS27.swift`: `#if compiler(>=6.4)` keeps the project building
/// against the older Xcode the Swift CodeQL job uses, and `@available(iOS 27, *)`
/// keeps pre-27 devices on the text-only (or "unsupported") path at runtime.
///
/// This reuses `MealEstimator`'s `FoodSearchTool`/`MatchedFoodIds` (and its
/// hallucination guard) and produces the same `EstimatedMeal`/`MealEstimate`
/// result as the text path, so the review/confirm UI needs no changes.
extension MealEstimator {
    /// Whether photos can be estimated on this OS/device, on-device or via
    /// Private Cloud Compute. `AIMealSheet` uses this to decide whether to show
    /// the photo picker to Local (anonymous) users, who have no server fallback,
    /// and whether attached photos are usable by the "Estimate" action at all.
    var supportsPhotoInput: Bool {
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            return canEstimate
        }
        #endif
        return false
    }

    /// Estimates a meal from `description` and/or `images`. Falls back to the
    /// text-only path when there are no images, or when photo input isn't
    /// supported on this OS/device — the caller only has to gate the *button*
    /// on `supportsPhotoInput`, not every call site.
    func estimate(description: String, images: [UIImage]) async throws -> MealEstimate {
        guard !images.isEmpty, supportsPhotoInput else {
            return try await estimate(description: description)
        }
        #if compiler(>=6.4) && canImport(FoundationModels)
        if #available(iOS 27, *) {
            let attachments = await Self.makePhotoAttachments(images)
            guard !attachments.isEmpty else {
                throw MealEstimatorError.generationFailed(L10n.aiMealGenerationError)
            }
            return try await estimateWithFallback(
                onDevice: {
                    try await estimateWithPhotos(description: description, attachments: attachments, source: .onDevice)
                },
                privateCloud: {
                    try await estimateWithPhotos(
                        description: description,
                        attachments: attachments,
                        source: .privateCloudCompute
                    )
                }
            )
        }
        #endif
        return try await estimate(description: description)
    }
}

#if compiler(>=6.4) && canImport(FoundationModels)

@available(iOS 27, *)
extension MealEstimator {
    private static let photoInstructions = """
    You are a nutrition assistant helping a user log a meal from one or more photos \
    they took, optionally with a short text note. Identify each distinct food or \
    drink item visible in the photo(s). For each item, call the searchLocalFoods tool \
    once to look for a matching food in the user's personal food database. Prefer a \
    matched food when it is clearly the same item; only set matchedFoodId to an id \
    that the tool actually returned, and only when you are confident it's the same \
    item. When you use a match, express the quantity as a number of servings of that \
    food, using the serving size and unit the tool result gives you. When there is no \
    good match, estimate realistic European portion sizes from what's visible and \
    report calories in kcal and protein, carbs, fat and fiber in grams. If a text note \
    is included, use it only to clarify quantities or items the photo(s) don't make \
    clear — the photo(s) are the primary source. Write each item's name in the \
    language of the text note, or in English if there is none.
    """

    /// Matches the server's own downsize target for AI task photos
    /// (`AiTaskStore.uploadMaxDimension`) — plenty for identifying food items,
    /// and keeps a handful of full-resolution camera captures from turning into
    /// a multi-hundred-megabyte set of attachments before the model does its
    /// own (documented) internal scaling.
    private static let photoMaxDimension: CGFloat = 1024

    /// Downscales once up front so a Private Cloud Compute retry reuses the
    /// same attachments instead of redrawing every photo again.
    static func makePhotoAttachments(_ images: [UIImage]) async -> [Attachment] {
        // Downscaling (and the orientation-correcting redraw it does) is a
        // visible main-thread hang for a few full-resolution captures — see
        // `AiTaskStore`'s identical reasoning for its own JPEG re-encode.
        let maxDimension = photoMaxDimension
        let cgImages: [CGImage] = await Task.detached(priority: .userInitiated) {
            images.compactMap { $0.downscaledForModelInput(maxDimension: maxDimension).cgImage }
        }.value
        return cgImages.map { Attachment($0) }
    }

    private func estimateWithPhotos(
        description: String,
        attachments: [Attachment],
        source: MealEstimateSource
    ) async throws -> MealEstimate {
        let matchedIds = MatchedFoodIds()
        let tool = FoodSearchTool(search: makeSearchClosure(), matchedIds: matchedIds)
        let session = switch source {
        case .onDevice:
            LanguageModelSession(tools: [tool], instructions: Self.photoInstructions)
        case .privateCloudCompute:
            LanguageModelSession(
                model: PrivateCloudComputeLanguageModel(),
                tools: [tool],
                instructions: Self.photoInstructions
            )
        }
        do {
            let response = try await session.respond(generating: EstimatedMeal.self) {
                Self.photoPromptText(description: description)
                for attachment in attachments {
                    attachment
                }
            }
            let validIds = await matchedIds.ids
            let items = response.content.items.map { item in
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
        } catch let error as LanguageModelSession.GenerationError {
            throw Self.mapGenerationError(error)
        } catch {
            throw MealEstimatorError.generationFailed(error.localizedDescription)
        }
    }

    private static func photoPromptText(description: String) -> String {
        let trimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return "Identify each distinct food or drink item visible in the photo(s) below and estimate this meal."
        }
        return """
        The user's note about this meal: "\(trimmed)"
        Identify each distinct food or drink item visible in the photo(s) below, using \
        the note above only to clarify anything the photo(s) don't make clear, and \
        estimate this meal.
        """
    }
}

private extension UIImage {
    /// Redraws the image upright and downscaled to at most `maxDimension` on the
    /// longest side — same approach as `downscaledJPEGData` in CameraPicker.swift,
    /// but returning a `UIImage` (for `Attachment`'s `CGImage`) instead of encoded
    /// `Data`. `draw(in:)` inside a renderer context corrects orientation as a
    /// side effect, which `Attachment(_ image: CGImage, orientation:)` otherwise
    /// needs told explicitly.
    func downscaledForModelInput(maxDimension: CGFloat) -> UIImage {
        let longestSide = max(size.width, size.height)
        let scale = longestSide > maxDimension ? maxDimension / longestSide : 1
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}

#endif
