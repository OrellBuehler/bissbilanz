import Charts
import SwiftUI

struct InsightsView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var weeklyStats: MacroTotals?
    @State private var monthlyStats: MacroTotals?
    @State private var streaks: StreaksResponse?
    @State private var topFoods: [TopFoodEntry] = []
    @State private var dailyStats: [DailyStatsEntry] = []
    @State private var mealBreakdown: [MealBreakdownEntry] = []
    @State private var goals: Goals?
    @State private var selectedRange = 7
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if isLoading {
                        LoadingView()
                    } else {
                        dateRangePicker
                        calorieTrendChart
                        mealBreakdownChart
                        streaksCard
                        weeklyCard
                        monthlyCard
                        topFoodsCard
                    }
                }
                .padding()
            }
            .navigationTitle(L10n.insights)
            .refreshable { await loadAll() }
            .task { await loadAll() }
        }
    }

    // MARK: - Date Range Picker

    private var dateRangePicker: some View {
        Picker(L10n.period, selection: $selectedRange) {
            Text("7d").tag(7)
            Text("30d").tag(30)
        }
        .pickerStyle(.segmented)
        .onChange(of: selectedRange) { _, _ in
            Task { await loadChartData() }
        }
    }

    // MARK: - Calorie Trend Chart

    @ViewBuilder
    private var calorieTrendChart: some View {
        if !dailyStats.isEmpty {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.caloriesTrend, systemImage: "chart.xyaxis.line")
                        .font(.headline)

                    Chart(dailyStats, id: \.date) { stat in
                        LineMark(
                            x: .value("Date", DateFormatting.date(from: stat.date) ?? Date()),
                            y: .value("Calories", stat.calories)
                        )
                        .foregroundStyle(MacroColors.calories)

                        if let goal = goals?.calorieGoal {
                            RuleMark(y: .value("Goal", goal))
                                .foregroundStyle(.gray.opacity(0.5))
                                .lineStyle(StrokeStyle(dash: [5, 5]))
                        }
                    }
                    .frame(height: 200)
                    .chartYAxis {
                        AxisMarks(position: .leading)
                    }
                }
            }
        }
    }

    // MARK: - Meal Breakdown Pie Chart

    @ViewBuilder
    private var mealBreakdownChart: some View {
        if !mealBreakdown.isEmpty {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.mealBreakdown, systemImage: "chart.pie")
                        .font(.headline)

                    Chart(mealBreakdown, id: \.mealType) { meal in
                        SectorMark(
                            angle: .value("Calories", meal.calories),
                            innerRadius: .ratio(0.5)
                        )
                        .foregroundStyle(mealColor(meal.mealType))
                        .annotation(position: .overlay) {
                            Text(L10n.mealName(meal.mealType))
                                .font(.caption2)
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(height: 200)
                }
            }
        }
    }

    // MARK: - Streaks

    @ViewBuilder
    private var streaksCard: some View {
        if let streaks {
            CardView {
                VStack(spacing: 12) {
                    Label(L10n.streaks, systemImage: "flame")
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 32) {
                        VStack {
                            Text("\(streaks.currentStreak)")
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(MacroColors.calories)
                            Text(L10n.currentStreak)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        VStack {
                            Text("\(streaks.longestStreak)")
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(MacroColors.fiber)
                            Text(L10n.longestStreak)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Weekly Average

    @ViewBuilder
    private var weeklyCard: some View {
        if let stats = weeklyStats {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.weeklyAvg, systemImage: "calendar")
                        .font(.headline)

                    NutrientRow(label: L10n.calories, value: stats.calories, unit: "kcal", color: MacroColors.calories)
                    NutrientRow(label: L10n.protein, value: stats.protein, unit: "g", color: MacroColors.protein)
                    NutrientRow(label: L10n.carbs, value: stats.carbs, unit: "g", color: MacroColors.carbs)
                    NutrientRow(label: L10n.fat, value: stats.fat, unit: "g", color: MacroColors.fat)
                    NutrientRow(label: L10n.fiber, value: stats.fiber, unit: "g", color: MacroColors.fiber)
                }
            }
        }
    }

    // MARK: - Monthly Average

    @ViewBuilder
    private var monthlyCard: some View {
        if let stats = monthlyStats {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.monthlyAvg, systemImage: "calendar.badge.clock")
                        .font(.headline)

                    NutrientRow(label: L10n.calories, value: stats.calories, unit: "kcal", color: MacroColors.calories)
                    NutrientRow(label: L10n.protein, value: stats.protein, unit: "g", color: MacroColors.protein)
                    NutrientRow(label: L10n.carbs, value: stats.carbs, unit: "g", color: MacroColors.carbs)
                    NutrientRow(label: L10n.fat, value: stats.fat, unit: "g", color: MacroColors.fat)
                    NutrientRow(label: L10n.fiber, value: stats.fiber, unit: "g", color: MacroColors.fiber)
                }
            }
        }
    }

    // MARK: - Top Foods

    @ViewBuilder
    private var topFoodsCard: some View {
        if !topFoods.isEmpty {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.topFoods + " (\(selectedRange)d)", systemImage: "trophy")
                        .font(.headline)

                    ForEach(Array(topFoods.enumerated()), id: \.element.id) { index, food in
                        HStack {
                            Text("\(index + 1).")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 20, alignment: .leading)
                            Text(food.foodName)
                                .lineLimit(1)
                            Spacer()
                            Text("\(food.count)x")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(Int(food.calories)) cal")
                                .font(.caption)
                                .foregroundStyle(MacroColors.calories)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func mealColor(_ mealType: String) -> Color {
        switch mealType.lowercased() {
        case "breakfast": return .orange
        case "lunch": return .blue
        case "dinner": return .purple
        case "snacks", "snack": return .green
        default: return .gray
        }
    }

    // MARK: - Data Loading

    private func loadAll() async {
        isLoading = true

        async let w = try? api.getWeeklyStats()
        async let m = try? api.getMonthlyStats()
        async let s = try? api.getStreaks()
        async let t = try? api.getTopFoods(days: selectedRange)
        async let g = try? api.getGoals()

        weeklyStats = await w
        monthlyStats = await m
        streaks = await s
        topFoods = await t ?? []
        goals = await g

        await loadChartData()
        isLoading = false
    }

    private func loadChartData() async {
        let endDate = Date()
        let startDate = endDate.adding(days: -selectedRange)

        async let daily = try? api.getDailyStats(
            startDate: DateFormatting.isoString(from: startDate),
            endDate: DateFormatting.isoString(from: endDate)
        )
        async let meals = try? api.getMealBreakdown(days: selectedRange)
        async let foods = try? api.getTopFoods(days: selectedRange)

        if let response = await daily {
            dailyStats = response.data
        }
        mealBreakdown = await meals ?? []
        topFoods = await foods ?? []
    }
}

struct CardView<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
