import SwiftUI

/// Sequential, cancellable sweep over every local food with no labels yet,
/// suggesting and saving labels for each in turn. Pushed from `SettingsView`'s
/// "Food labels" section. `.task` starts the sweep as soon as the view
/// appears and SwiftUI cancels it automatically when the view goes away
/// (navigating back), so `runSweep` only needs to check `Task.isCancelled`
/// between items to stop promptly.
struct LabelUnlabeledFoodsView: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(FoodLabeler.self) private var foodLabeler
    @Environment(FoodImageLoader.self) private var foodImageLoader

    @State private var done = 0
    @State private var total = 0
    @State private var currentFoodName: String?
    @State private var labelledCount = 0
    @State private var failedCount = 0
    @State private var isFinished = false

    var body: some View {
        List {
            // What's actually happening: TestFlight feedback was that a bare
            // progress bar left it unclear what the sweep does or where the
            // data goes, so this stays visible for the whole run, not just
            // while idle.
            Section {
                Text(L10n.labelSweepExplanation(provider: FoodLabelProviderSettings.selected))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                if isFinished {
                    Label {
                        Text(L10n.foodLabelSweepSummary(labelled: labelledCount, failed: failedCount))
                    } icon: {
                        Image(systemName: "checkmark.circle")
                            .foregroundStyle(.green)
                    }
                } else {
                    HStack(spacing: 12) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.foodLabelSweepProgress(done, total))
                                .font(.subheadline)
                            if let currentFoodName {
                                Text(currentFoodName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    ProgressView(value: total > 0 ? Double(done) / Double(total) : 0)
                }
            }
        }
        .navigationTitle(L10n.labelUnlabeledFoods)
        .navigationBarTitleDisplayMode(.inline)
        .task { await runSweep() }
    }

    private func runSweep() async {
        let foods = foodRepository.unlabeledLocalFoods()
        total = foods.count
        for food in foods {
            if Task.isCancelled { return }
            currentFoodName = food.name
            do {
                let image = await foodImageLoader.image(for: food.imageUrl)
                let suggestions = try await foodLabeler.labels(for: FoodLabelInput(
                    name: food.name,
                    brand: food.brand,
                    servingUnit: food.servingUnit,
                    ingredientsText: food.ingredientsText,
                    image: image
                ))
                if !suggestions.isEmpty {
                    try await foodRepository.addGeneratedLabels(id: food.id, labels: suggestions)
                }
                labelledCount += 1
            } catch {
                failedCount += 1
                ErrorReporter.captureWarning(
                    "Label sweep item failed",
                    context: ["reason": ErrorReporter.reason(for: error), "sync.food_id": food.id]
                )
            }
            done += 1
        }
        currentFoodName = nil
        isFinished = true
    }
}
