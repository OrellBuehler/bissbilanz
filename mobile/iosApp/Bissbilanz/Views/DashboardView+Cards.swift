import SwiftUI

extension DashboardView {
    // MARK: - Hero

    var heroCard: some View {
        let adjusted = activityAdjustment
        return DashboardHeroCard(
            totals: DashboardTotals(
                calories: totalCalories,
                protein: totalProtein,
                carbs: totalCarbs,
                fat: totalFat,
                fiber: totalFiber
            ),
            goals: adjusted.goals,
            activityBonus: adjusted.activityBonus,
            activityCalories: preferences.showActivityWidget ? dayActivityCalories : nil
        )
    }

    // MARK: - Weight Widget

    /// `fillHeight` stretches the card to its row partner's height when the
    /// weight and sleep cards share a row; a lone card hugs its content.
    func weightWidget(_ entry: WeightEntry, fillHeight: Bool) -> some View {
        DashboardWeightCard(entry: entry, caption: entryDateCaption(entry.entryDate), fillHeight: fillHeight)
    }

    // MARK: - Sleep Widget

    /// Sleep for the night nearest the selected day (a night is keyed by its
    /// wake day), captioned with the entry's own date. On today the card keeps
    /// the log prompt until last night is actually logged.
    func sleepWidget(fillHeight: Bool) -> some View {
        let sleep = visibleSleep
        return DashboardSleepCard(
            sleep: sleep,
            caption: sleep.map { entryDateCaption($0.entryDate) } ?? "",
            fillHeight: fillHeight
        )
    }

    private var visibleSleep: SleepEntry? {
        guard let sleep = closestSleep, sleep.entryDate == dateString || !selectedDate.isToday else { return nil }
        return sleep
    }

    // MARK: - Supplements Widget

    var supplementsWidget: some View {
        DashboardSupplementsCard(items: supplementChecklist) { item in
            Task { await toggleSupplement(item) }
        }
    }

    // MARK: - Calorie Trend Widget

    /// Same line/goal-rule shape as the insights calorie chart, sized for a
    /// dashboard card. Hidden until the window holds at least two logged days —
    /// a single point is not a trend.
    var calorieTrendWidget: some View {
        DashboardTrendCard(trend: calorieTrend, goal: goals.calorieGoal)
    }

    // MARK: - Favorites Widget

    /// A one-tap row of the user's favorites: the quick-log button logs one
    /// serving at the meal the clock suggests, the card itself opens the full
    /// log form. Reads the local store, so it works offline and in Local mode.
    var favoritesWidget: some View {
        DashboardFavoritesSection(
            foods: favoriteFoods,
            onSelect: { selectedFavorite = $0 },
            onQuickLog: { food in
                Task { await quickLogFavorite(food) }
            }
        )
    }

    // MARK: - Recipe Suggestions Widget

    /// Top 3 recipes that fit the day's remaining budget, with a link to the
    /// full ranking. Shown whenever the section is on (see `DashboardSection`),
    /// even with no recipes yet — the empty states explain what's missing.
    var recipeSuggestionsWidget: some View {
        DashboardRecipeSuggestionsCard(
            hasRecipes: !allRecipes.isEmpty,
            goalReached: remainingBudget.calories < LocalRecipeSuggestions.minRemainingCalories,
            suggestions: recipeSuggestionsPreview
        )
    }

    // MARK: - Meal Breakdown Widget

    /// Where the day's calories went, meal by meal. Bars are proportional to
    /// the biggest meal so the shape reads at a glance.
    var mealBreakdownWidget: some View {
        DashboardMealBreakdownCard(slices: mealCalories)
    }

    // MARK: - Top Foods Widget

    /// What the user logs most over the trend window, counted from the local
    /// entry log rather than the server's `/api/stats/top-foods`, so the card
    /// renders the same in Local mode.
    var topFoodsWidget: some View {
        DashboardTopFoodsCard(foods: topFoods)
    }
}
