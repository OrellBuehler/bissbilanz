import SwiftUI

/// Sequential, cancellable sweep over every local barcode food that still
/// lacks Nutri-Score, NOVA group or ingredients, loading them from Open Food
/// Facts via `FoodRepository.enrichFood`. Pushed from `SettingsView`. Same
/// lifecycle as `LabelUnlabeledFoodsView`: `.task` starts the sweep when the
/// view appears and SwiftUI cancels it when the view goes away, so the loop
/// only has to honour cancellation between items.
///
/// Each enrichment is an ordinary optimistic food update plus one queued
/// `updateFood`, which `SyncManager` drains sequentially — the same traffic
/// as editing that many foods by hand, and the ~2 s pacing below keeps the
/// queue from growing faster than it drains.
struct EnhanceFoodsView: View {
    @Environment(FoodRepository.self) private var foodRepository

    @State private var done = 0
    @State private var total = 0
    @State private var currentFoodName: String?
    @State private var updatedCount = 0
    @State private var notFoundCount = 0
    @State private var failedCount = 0
    @State private var isWaitingForRateLimit = false
    @State private var isFinished = false

    /// The server proxy allows 30 Open Food Facts lookups a minute per user.
    private static let lookupSpacing: Duration = .seconds(2)
    private static let rateLimitBackoff: Duration = .seconds(20)
    private static let maxRateLimitRetries = 5

    var body: some View {
        List {
            Section {
                Text(L10n.enhanceFoodsExplanation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                if isFinished {
                    Label {
                        Text(L10n.enhanceFoodsSummary(updated: updatedCount, notFound: notFoundCount, failed: failedCount))
                    } icon: {
                        Image(systemName: "checkmark.circle")
                            .foregroundStyle(.green)
                    }
                } else {
                    HStack(spacing: 12) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.enhanceFoodsProgress(done, total))
                                .font(.subheadline)
                            if isWaitingForRateLimit {
                                Text(L10n.enhanceFoodsWaiting)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            } else if let currentFoodName {
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
        .navigationTitle(L10n.enhanceFoods)
        .navigationBarTitleDisplayMode(.inline)
        .task { await runSweep() }
    }

    private func runSweep() async {
        let foods = foodRepository.unenrichedLocalFoods()
        total = foods.count
        for (index, food) in foods.enumerated() {
            if Task.isCancelled { return }
            guard let barcode = food.barcode else {
                done += 1
                continue
            }
            if index > 0, !(await pause(Self.lookupSpacing)) { return }
            currentFoodName = food.name
            var rateLimitRetries = 0
            while true {
                do {
                    try await foodRepository.enrichFood(id: food.id, barcode: barcode)
                    updatedCount += 1
                } catch {
                    if Task.isCancelled { return }
                    if case APIError.notFound = error {
                        notFoundCount += 1
                    } else if case APIError.serverError(429, _) = error, rateLimitRetries < Self.maxRateLimitRetries {
                        rateLimitRetries += 1
                        isWaitingForRateLimit = true
                        let resumed = await pause(Self.rateLimitBackoff)
                        isWaitingForRateLimit = false
                        if !resumed { return }
                        continue
                    } else {
                        failedCount += 1
                        ErrorReporter.captureWarning(
                            "Enhance foods sweep item failed",
                            context: ["reason": ErrorReporter.reason(for: error), "sync.food_id": food.id]
                        )
                    }
                }
                break
            }
            done += 1
        }
        currentFoodName = nil
        isFinished = true
    }

    /// Cancellation-aware sleep; false means the sweep was cancelled meanwhile.
    private func pause(_ duration: Duration) async -> Bool {
        try? await Task.sleep(for: duration)
        return !Task.isCancelled
    }
}
