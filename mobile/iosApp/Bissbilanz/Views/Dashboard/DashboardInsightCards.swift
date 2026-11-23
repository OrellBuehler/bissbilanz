import Charts
import SwiftUI

struct DashboardTrendCard: View {
    let trend: [DashboardTrendPoint]
    let goal: Double

    /// Read before a VoiceOver user swipes through each day's data point.
    private var accessibilitySummary: String {
        let logged = trend.filter { $0.calories > 0 }
        guard let first = logged.first, let last = logged.last else { return L10n.noEntries }
        let average = logged.reduce(0.0) { $0 + $1.calories } / Double(logged.count)
        var summary = L10n.chartAverageValue(MacroFormat.kcal(average), unit: L10n.calories)
        if logged.count > 1 {
            summary += ", " + (last.calories >= first.calories ? L10n.chartTrendingUp : L10n.chartTrendingDown)
        }
        return summary
    }

    var body: some View {
        if trend.count(where: { $0.calories > 0 }) >= 2 {
            VStack(alignment: .leading, spacing: 10) {
                CardHeader(L10n.caloriesTrend, systemImage: "chart.xyaxis.line", tint: MacroColors.calories) {
                    Text(L10n.last7Days)
                        .font(.caption)
                        .foregroundStyle(Brand.textSecondary)
                }

                Chart(trend) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Calories", point.calories)
                    )
                    .foregroundStyle(MacroColors.calories)
                    .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round))
                    .interpolationMethod(.catmullRom)

                    if goal > 0 {
                        RuleMark(y: .value("Goal", goal))
                            .foregroundStyle(.gray.opacity(0.5))
                            .lineStyle(StrokeStyle(dash: [5, 5]))
                            .accessibilityLabel(L10n.dailyGoals)
                            .accessibilityValue(MacroFormat.kcal(goal))
                    }
                }
                .frame(height: 120)
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(position: .leading)
                }
                .accessibilityLabel(L10n.caloriesTrend)
                .accessibilityValue(accessibilitySummary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
    }
}

struct DashboardFavoritesSection: View {
    let foods: [Food]
    let onSelect: (Food) -> Void
    let onQuickLog: (Food) -> Void

    var body: some View {
        if !foods.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(L10n.favorites)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(foods) { food in
                            FavoriteCard(
                                name: food.name,
                                brand: food.brand,
                                calories: Int(food.calories),
                                protein: Int(food.protein),
                                imageUrl: food.imageUrl,
                                onTap: { onSelect(food) },
                                onQuickLog: { onQuickLog(food) }
                            )
                            .frame(width: 150)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollClipDisabled()
            }
        }
    }
}

struct DashboardRecipeSuggestionsCard: View {
    let hasRecipes: Bool
    let goalReached: Bool
    let suggestions: [DashboardRecipeSuggestion]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CardHeader(L10n.recipeSuggestionsCardTitle, systemImage: "fork.knife.circle", tint: MacroColors.protein) {
                NavigationLink {
                    RecipeSuggestionsView()
                } label: {
                    Text(L10n.showAll)
                        .font(.brand(.caption, weight: .semibold))
                }
            }

            if !hasRecipes {
                note(L10n.recipeSuggestionsNoRecipesDescription)
            } else if goalReached {
                note(L10n.recipeSuggestionsGoalReachedDescription)
            } else if suggestions.isEmpty {
                note(L10n.recipeSuggestionsNoMatchesDescription)
            } else {
                VStack(spacing: 8) {
                    ForEach(suggestions) { item in
                        DashboardRecipeSuggestionRow(item: item)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(Brand.textSecondary)
    }
}

private struct DashboardRecipeSuggestionRow: View {
    let item: DashboardRecipeSuggestion

    var body: some View {
        HStack(spacing: 8) {
            Text(item.recipe.name)
                .font(.subheadline)
                .foregroundStyle(Brand.text)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text("\(MacroFormat.servings(item.suggestion.servings))\u{00D7}")
                .font(.caption)
                .foregroundStyle(Brand.textSecondary)
            MacroTinted(macro: .calories) { tint in
                Chip("\(MacroFormat.kcal(item.suggestion.calories)) kcal", tint: tint)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct DashboardMealBreakdownCard: View {
    let slices: [DashboardMealSlice]

    @ScaledMetric private var labelWidth: CGFloat = 84
    @ScaledMetric private var valueWidth: CGFloat = 74

    private var peak: Double {
        slices.first?.calories ?? 0
    }

    var body: some View {
        if slices.count > 1 {
            VStack(alignment: .leading, spacing: 10) {
                CardHeader(L10n.mealBreakdown, systemImage: "chart.pie", tint: MacroColors.calories)

                ForEach(slices) { item in
                    HStack(spacing: 10) {
                        Text(L10n.mealName(item.meal))
                            .font(.caption)
                            .foregroundStyle(Brand.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(width: labelWidth, alignment: .leading)
                        BrandProgressBar(
                            value: peak > 0 ? item.calories / peak : 0,
                            tint: MacroColors.calories,
                            height: 10
                        )
                        Text("\(MacroFormat.kcal(item.calories)) kcal")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Brand.textSecondary)
                            .frame(width: valueWidth, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
    }
}

struct DashboardTopFoodsCard: View {
    let foods: [DashboardTopFood]

    var body: some View {
        if !foods.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CardHeader(L10n.topFoods, systemImage: "trophy", tint: MacroColors.fat) {
                    Text(L10n.last7Days)
                        .font(.caption)
                        .foregroundStyle(Brand.textSecondary)
                }

                ForEach(Array(foods.enumerated()), id: \.element.id) { index, food in
                    DashboardTopFoodRow(rank: index + 1, food: food)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
    }
}

private struct DashboardTopFoodRow: View {
    let rank: Int
    let food: DashboardTopFood

    var body: some View {
        HStack(spacing: 8) {
            Text("\(rank).")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(Brand.textSecondary)
                .frame(width: 20, alignment: .leading)
            Text(food.name)
                .font(.subheadline)
                .foregroundStyle(Brand.text)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text("\(food.count)\u{00D7}")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(Brand.textSecondary)
            MacroTinted(macro: .calories) { tint in
                Chip("\(MacroFormat.kcal(food.calories)) kcal", tint: tint)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
