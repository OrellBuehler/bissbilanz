import SwiftUI

/// Start, watch and stop the bulk labelling sweep. Pushed from `SettingsView`'s
/// "Food labels" section. The sweep itself belongs to
/// `FoodLabelSweepController`, so it keeps running when this screen is left.
struct LabelUnlabeledFoodsView: View {
    @Environment(FoodLabelSweepController.self) private var controller
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository

    private var unlabeledTotal: Int {
        foodRepository.unlabeledLocalFoods().count + recipeRepository.unlabeledLocalRecipes().count
    }

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

            if controller.isRunning {
                LabelSweepRunningSection(progress: controller.progress)
                Section {
                    Button(role: .destructive) {
                        controller.stop()
                    } label: {
                        Label(L10n.enhanceFoodsStop, systemImage: "stop.circle")
                    }
                }
            } else {
                LabelSweepIdleSection(progress: controller.progress)
                Section {
                    Button {
                        controller.start()
                    } label: {
                        Label(L10n.enhanceFoodsStart, systemImage: "sparkles")
                    }
                    .disabled(unlabeledTotal == 0)
                }
            }
        }
        .brandForm()
        .navigationTitle(L10n.labelUnlabeledFoods)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LabelSweepRunningSection: View {
    let progress: FoodLabelSweepProgress

    var body: some View {
        Section {
            HStack(spacing: 12) {
                ProgressView()
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.foodLabelSweepProgress(progress.done, progress.total))
                        .font(.subheadline)
                    if let name = progress.currentItemName {
                        Text(name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            ProgressView(value: EnhanceFoodsView.fraction(progress.done, of: progress.total))
        } footer: {
            Text(L10n.enhanceFoodsDeviceNote)
        }
    }
}

private struct LabelSweepIdleSection: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository

    let progress: FoodLabelSweepProgress

    var body: some View {
        Section {
            Text(L10n.unlabeledCount(
                foods: foodRepository.unlabeledLocalFoods().count,
                recipes: recipeRepository.unlabeledLocalRecipes().count
            ))
            if let summary = L10n.foodLabelSweepResult(progress) {
                Label {
                    Text(summary)
                } icon: {
                    Image(systemName: progress.state == .completed ? "checkmark.circle" : "stop.circle")
                        .foregroundStyle(progress.state == .completed ? Color.green : Color.secondary)
                }
                .font(.subheadline)
            }
        }
    }
}
