import SwiftUI

/// The diary entries (and, for a food, the recipes and supplements) that use a
/// food or recipe, newest entry first. Backs the blocked-delete prompts: tapping
/// an entry opens that day with the entry highlighted so it can be removed or
/// changed, and a recipe opens the recipe. Presented as a sheet with its own
/// navigation stack, so the user returns to the prompt's screen when done.
struct WhereUsedSheet: View {
    let title: String
    let name: String
    let load: () async throws -> WhereUsed

    @Environment(\.dismiss) private var dismiss

    @State private var usage: WhereUsed?
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Group {
                if let usage {
                    if usage.isEmpty {
                        ContentUnavailableView(L10n.whereUsedEmpty, systemImage: "tray")
                    } else {
                        usageList(usage)
                    }
                } else if failed {
                    ContentUnavailableView(L10n.whereUsedFailed, systemImage: "exclamationmark.triangle")
                } else {
                    LoadingView()
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.done) { dismiss() }
                }
            }
        }
        .task { await loadUsage() }
    }

    private func usageList(_ usage: WhereUsed) -> some View {
        List {
            Section {
                Text(name)
                    .font(.headline)
                    .listRowBackground(Color.clear)
            }
            if !usage.recipes.isEmpty {
                Section(L10n.whereUsedRecipesHeading(usage.recipes.count)) {
                    ForEach(usage.recipes) { recipe in
                        NavigationLink {
                            RecipeDetailView(recipeId: recipe.id)
                        } label: {
                            HStack {
                                Text(recipe.name)
                                Spacer()
                                if recipe.isLastIngredient {
                                    Text(L10n.whereUsedLastIngredient)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            if !usage.supplements.isEmpty {
                Section(L10n.whereUsedSupplementsHeading(usage.supplements.count)) {
                    ForEach(usage.supplements) { supplement in
                        NavigationLink {
                            SupplementsView()
                        } label: {
                            Text(supplement.name)
                        }
                    }
                }
            }
            if usage.totalEntries > 0 {
                Section {
                    ForEach(usage.entries) { entry in
                        // Label-based link: see CalendarView for why a value-based
                        // link into the day log is avoided.
                        NavigationLink {
                            DayLogView(date: entry.date, highlightEntryId: entry.id)
                        } label: {
                            entryRow(entry)
                        }
                    }
                } header: {
                    Text(L10n.whereUsedEntriesHeading(usage.totalEntries))
                } footer: {
                    if usage.totalEntries > usage.entries.count {
                        Text(L10n.whereUsedShowingNewest(shown: usage.entries.count, total: usage.totalEntries))
                    }
                }
            }
        }
    }

    private func entryRow(_ entry: WhereUsedEntry) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(dayLabel(entry.date))
                Text(L10n.mealName(entry.mealType))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(L10n.whereUsedServings(MacroFormat.servings(entry.servings)))
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func dayLabel(_ date: String) -> String {
        DateFormatting.date(from: date).map { L10n.dayLabel($0) } ?? date
    }

    private func loadUsage() async {
        do {
            usage = try await load()
        } catch {
            if error is CancellationError { return }
            ErrorReporter.captureWarning(
                "Where-used load failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            failed = true
        }
    }
}
