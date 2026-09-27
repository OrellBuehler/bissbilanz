import SwiftUI

/// Full ranking of the user's recipes against today's remaining calorie/macro
/// budget (goal minus what's already logged) — the dashboard's compact card
/// links here for the complete list. Modeled on `FavoritesView`: reads the
/// local store first, refreshes from the API on top, and recomputes after a
/// log.
struct RecipeSuggestionsView: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(GoalsRepository.self) private var goalsRepository
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    @State private var recipes: [Recipe] = []
    @State private var goals: Goals?
    @State private var entries: [Entry] = []
    @State private var preferences: Preferences = .defaults
    @State private var activityCalories: Int?
    @State private var isLoading = true
    @State private var pendingLog: PendingLog?

    private struct PendingLog: Identifiable {
        let recipe: Recipe
        let servings: Double
        var id: String {
            recipe.id
        }
    }

    private var totalCalories: Double {
        entries.reduce(0) { $0 + $1.totalCalories }
    }

    private var totalProtein: Double {
        entries.reduce(0) { $0 + $1.totalProtein }
    }

    private var totalCarbs: Double {
        entries.reduce(0) { $0 + $1.totalCarbs }
    }

    private var totalFat: Double {
        entries.reduce(0) { $0 + $1.totalFat }
    }

    /// nil until goals have loaded at least once — distinguishes "no goals
    /// set" from "goals are all zero". Raised by today's workout calories
    /// when the activity goal adjustment is on, like the dashboard rings.
    private var remaining: (calories: Double, protein: Double, carbs: Double, fat: Double)? {
        guard let baseGoals = goals else { return nil }
        let goals = adjustGoalsForActivity(
            goals: baseGoals,
            activityCalories: activityCalories,
            enabled: preferences.activityGoalAdjustment,
            creditPercent: preferences.activityCreditPercent
        ).goals
        return (
            calories: goals.calorieGoal - totalCalories,
            protein: goals.proteinGoal - totalProtein,
            carbs: goals.carbGoal - totalCarbs,
            fat: goals.fatGoal - totalFat
        )
    }

    private var suggestions: [LocalRecipeSuggestions.Suggestion] {
        guard let remaining else { return [] }
        return LocalRecipeSuggestions.suggest(remaining: remaining, recipes: recipes)
    }

    private var recipesById: [String: Recipe] {
        Dictionary(uniqueKeysWithValues: recipes.map { ($0.id, $0) })
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(L10n.recipeSuggestions)
                .navigationBarTitleDisplayMode(.inline)
                .refreshable { await load() }
                .task { await load() }
                .sheet(item: $pendingLog) { pending in
                    LogRecipeSheet(
                        recipe: pending.recipe,
                        initialServings: pending.servings,
                        initialMealType: MealTiming.mealForCurrentTime()
                    ) {
                        Task { await load() }
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading {
            LoadingView()
        } else if recipes.isEmpty {
            noRecipesState
        } else if let remaining {
            if remaining.calories < LocalRecipeSuggestions.minRemainingCalories {
                goalReachedState
            } else if suggestions.isEmpty {
                noMatchesState
            } else {
                suggestionsList(remaining: remaining)
            }
        } else {
            noGoalsState
        }
    }

    private func suggestionsList(
        remaining: (calories: Double, protein: Double, carbs: Double, fat: Double)
    ) -> some View {
        List {
            Section {
                remainingHeader(remaining)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            Section {
                ForEach(suggestions) { suggestion in
                    if let recipe = recipesById[suggestion.id] {
                        Button {
                            pendingLog = PendingLog(recipe: recipe, servings: suggestion.servings)
                        } label: {
                            suggestionRow(suggestion, recipe: recipe)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    // MARK: - Header

    private func remainingHeader(
        _ remaining: (calories: Double, protein: Double, carbs: Double, fat: Double)
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.recipeSuggestionsRemainingLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 16) {
                remainingStat(L10n.calories, value: remaining.calories, unit: "kcal", color: accessibleColor(.calories))
                remainingStat(L10n.protein, value: remaining.protein, unit: "g", color: accessibleColor(.protein))
                remainingStat(L10n.carbs, value: remaining.carbs, unit: "g", color: accessibleColor(.carbs))
                remainingStat(L10n.fat, value: remaining.fat, unit: "g", color: accessibleColor(.fat))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func remainingStat(_ label: String, value: Double, unit: String, color: Color) -> some View {
        let clamped = max(value, 0)
        return VStack(spacing: 2) {
            Text(unit == "kcal" ? "\(MacroFormat.kcal(clamped)) kcal" : "\(MacroFormat.nutrient(clamped)) g")
                .font(.headline)
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(unit == "kcal" ? "\(MacroFormat.kcal(clamped)) kcal" : "\(MacroFormat.nutrient(clamped)) g")
    }

    // MARK: - Row

    private func suggestionRow(_ suggestion: LocalRecipeSuggestions.Suggestion, recipe: Recipe) -> some View {
        HStack(spacing: 12) {
            if recipe.imageUrl != nil {
                FoodImageView(imageUrl: recipe.imageUrl)
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(recipe.name)
                        .font(.body)
                    if recipe.isFavorite {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                            .accessibilityHidden(true)
                    }
                    Spacer()
                    Text("\(MacroFormat.servings(suggestion.servings))\u{00D7}")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 8) {
                    Text("\(MacroFormat.kcal(suggestion.calories)) kcal")
                        .foregroundStyle(accessibleColor(.calories))
                    Text("P \(MacroFormat.nutrient(suggestion.protein))")
                        .foregroundStyle(accessibleColor(.protein))
                    Text("C \(MacroFormat.nutrient(suggestion.carbs))")
                        .foregroundStyle(accessibleColor(.carbs))
                    Text("F \(MacroFormat.nutrient(suggestion.fat))")
                        .foregroundStyle(accessibleColor(.fat))
                }
                .font(.caption)
                Text(L10n.recipeSuggestionsFitPercent(suggestion.fit))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(suggestionAccessibilityLabel(suggestion, recipe: recipe))
    }

    private func suggestionAccessibilityLabel(_ suggestion: LocalRecipeSuggestions.Suggestion, recipe: Recipe) -> String {
        var parts = [recipe.name]
        if recipe.isFavorite { parts.append(L10n.favorite) }
        parts.append(MacroSpokenSummary.macros(
            calories: suggestion.calories,
            protein: suggestion.protein,
            carbs: suggestion.carbs,
            fat: suggestion.fat
        ))
        parts.append(L10n.recipeSuggestionsFitPercent(suggestion.fit))
        return parts.joined(separator: ", ")
    }

    // MARK: - Empty States

    private var noRecipesState: some View {
        ContentUnavailableView {
            Label(L10n.recipeSuggestionsNoRecipesTitle, systemImage: "book.closed")
        } description: {
            Text(L10n.recipeSuggestionsNoRecipesDescription)
        } actions: {
            NavigationLink {
                RecipeListView()
            } label: {
                Text(L10n.createRecipe)
            }
            .buttonStyle(.bordered)
        }
    }

    private var noGoalsState: some View {
        ContentUnavailableView(
            L10n.recipeSuggestionsNoGoalsTitle,
            systemImage: "target",
            description: Text(L10n.recipeSuggestionsNoGoalsDescription)
        )
    }

    private var goalReachedState: some View {
        ContentUnavailableView(
            L10n.recipeSuggestionsGoalReachedTitle,
            systemImage: "checkmark.circle",
            description: Text(L10n.recipeSuggestionsGoalReachedDescription)
        )
    }

    private var noMatchesState: some View {
        ContentUnavailableView(
            L10n.recipeSuggestionsNoMatchesTitle,
            systemImage: "fork.knife.circle",
            description: Text(L10n.recipeSuggestionsNoMatchesDescription)
        )
    }

    // MARK: - Data Loading

    private func load() async {
        recipes = recipeRepository.recipes()
        goals = goalsRepository.goals()
        entries = entryRepository.entries(date: DateFormatting.today)
        preferences = preferencesRepository.preferences() ?? .defaults
        activityCalories = entryRepository.dayProperties(date: DateFormatting.today)?.activityCalories
        isLoading = recipes.isEmpty && goals == nil

        async let recipesTask: Void? = try? recipeRepository.refresh()
        async let goalsTask: Void? = try? goalsRepository.refresh()
        async let entriesTask: Void? = try? entryRepository.refresh(date: DateFormatting.today)
        _ = await (recipesTask, goalsTask, entriesTask)

        recipes = recipeRepository.recipes()
        goals = goalsRepository.goals()
        entries = entryRepository.entries(date: DateFormatting.today)
        preferences = preferencesRepository.preferences() ?? .defaults
        activityCalories = entryRepository.dayProperties(date: DateFormatting.today)?.activityCalories
        isLoading = false
    }
}
