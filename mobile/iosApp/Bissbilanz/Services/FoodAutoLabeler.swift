import Foundation

/// Device-local toggle for whether a newly created/edited food with no
/// labels yet gets an automatic labelling pass (`FoodAutoLabeler.labelIfNeeded`),
/// using whichever provider `FoodLabelProviderSettings.selected` names. Same
/// local-only reasoning as `PrivateCloudComputeSettings`: whether this device
/// runs the model at all is a property of the device, not the account.
///
/// Defaults to on: the labeller only ever fires when the food has no labels
/// yet (never overwrites a user's or a scan's own choice) and the selected
/// provider can actually produce something (`FoodLabeler.isAvailable`) — which
/// is false while the provider is "AI assistant (MCP)", leaving it to the
/// assistant exactly like before.
enum FoodAutoLabelSettings {
    private static let key = "food_auto_label_enabled"

    static var isEnabled: Bool {
        get {
            guard UserDefaults.standard.object(forKey: key) != nil else { return true }
            return UserDefaults.standard.bool(forKey: key)
        }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

/// Fires the unattended labelling pass for a food right after it's created
/// or saved (`FoodEditSheet`, `BarcodeScannerView`). Runs in the background —
/// callers don't await it — and stays silent on failure beyond a logged
/// warning, since it's a best-effort convenience, not something the user is
/// waiting on.
@MainActor
enum FoodAutoLabeler {
    static func labelIfNeeded(
        _ food: Food,
        labeler: FoodLabeler,
        foodRepository: FoodRepository,
        foodImageLoader: FoodImageLoader
    ) {
        guard FoodAutoLabelSettings.isEnabled,
              (food.labels ?? []).isEmpty,
              labeler.isAvailable
        else { return }

        Task {
            do {
                let image = await foodImageLoader.image(for: food.imageUrl)
                let suggestions = try await labeler.labels(for: FoodLabelInput(
                    name: food.name,
                    brand: food.brand,
                    servingUnit: food.servingUnit,
                    ingredientsText: food.ingredientsText,
                    image: image
                ))
                guard !suggestions.isEmpty else { return }
                try await foodRepository.addGeneratedLabels(id: food.id, labels: suggestions)
            } catch {
                ErrorReporter.captureWarning(
                    "Automatic food labelling failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.food_id": food.id]
                )
            }
        }
    }
}
