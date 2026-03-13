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
                        streaksCard
                        calorieTrendChart
                        macroTrendsCard
                        mealBreakdownChart
                        goalAchievementCard
                        comparisonCard
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

    // MARK: - Macro Trends

    @ViewBuilder
    private var macroTrendsCard: some View {
        if !dailyStats.isEmpty {
            CardView {
                VStack(alignment: .leading, spacing: 12) {
                    Label(L10n.macroTrends, systemImage: "chart.xyaxis.line")
                        .font(.headline)

                    macroTrendRow(L10n.protein, data: dailyStats.map { ($0.date, $0.protein) }, unit: "g", color: MacroColors.protein)
                    macroTrendRow(L10n.carbs, data: dailyStats.map { ($0.date, $0.carbs) }, unit: "g", color: MacroColors.carbs)
                    macroTrendRow(L10n.fat, data: dailyStats.map { ($0.date, $0.fat) }, unit: "g", color: MacroColors.fat)
                    macroTrendRow(L10n.fiber, data: dailyStats.map { ($0.date, $0.fiber) }, unit: "g", color: MacroColors.fiber)
                }
            }
        }
    }

    private func macroTrendRow(_ label: String, data: [(String, Double)], unit: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(color)
                Spacer()
                let avg = data.isEmpty ? 0.0 : data.map(\.1).reduce(0, +) / Double(data.count)
                Text("Avg: \(Int(avg)) \(unit)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Chart(data, id: \.0) { item in
                LineMark(
                    x: .value("Date", DateFormatting.date(from: item.0) ?? Date()),
                    y: .value(label, item.1)
                )
                .foregroundStyle(color)
                .interpolationMethod(.catmullRom)
            }
            .chartYAxis(.hidden)
            .chartXAxis(.hidden)
            .frame(height: 50)
        }
    }

    // MARK: - Goal Achievement

    @ViewBuilder
    private var goalAchievementCard: some View {
        if let goals, !dailyStats.isEmpty {
            let totalDays = dailyStats.count
            let calHit = dailyStats.filter { $0.calories <= goals.calorieGoal * 1.05 && $0.calories >= goals.calorieGoal * 0.9 }.count
            let proteinHit = dailyStats.filter { $0.protein >= goals.proteinGoal * 0.9 }.count
            let carbsHit = dailyStats.filter { $0.carbs <= goals.carbGoal * 1.1 }.count
            let fatHit = dailyStats.filter { $0.fat <= goals.fatGoal * 1.1 }.count
            let fiberHit = dailyStats.filter { $0.fiber >= goals.fiberGoal * 0.9 }.count

            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.goalAchievement, systemImage: "target")
                        .font(.headline)

                    Text("\(L10n.daysWithinGoal) (\(totalDays) \(L10n.dayPeriod))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    goalBar(L10n.calories, hit: calHit, total: totalDays, color: MacroColors.calories)
                    goalBar(L10n.protein, hit: proteinHit, total: totalDays, color: MacroColors.protein)
                    goalBar(L10n.carbs, hit: carbsHit, total: totalDays, color: MacroColors.carbs)
                    goalBar(L10n.fat, hit: fatHit, total: totalDays, color: MacroColors.fat)
                    goalBar(L10n.fiber, hit: fiberHit, total: totalDays, color: MacroColors.fiber)
                }
            }
        }
    }

    private func goalBar(_ label: String, hit: Int, total: Int, color: Color) -> some View {
        let pct = total > 0 ? Double(hit) / Double(total) : 0

        return HStack(spacing: 8) {
            Text(label)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(color)
                .frame(width: 64, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: geo.size.width * min(pct, 1))
                }
            }
            .frame(height: 8)

            Text("\(Int(pct * 100))%")
                .font(.caption2)
                .fontWeight(.bold)
                .frame(width: 36, alignment: .trailing)
        }
    }

    // MARK: - Weekly vs Monthly Comparison

    @ViewBuilder
    private var comparisonCard: some View {
        if let weekly = weeklyStats, let monthly = monthlyStats {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label(L10n.avgComparison, systemImage: "arrow.left.arrow.right")
                        .font(.headline)

                    // Header row
                    HStack {
                        Text("")
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(L10n.weeklyAvg)
                            .font(.caption)
                            .fontWeight(.bold)
                            .frame(maxWidth: .infinity)
                        Text(L10n.monthlyAvg)
                            .font(.caption)
                            .fontWeight(.bold)
                            .frame(maxWidth: .infinity)
                        Text("")
                            .frame(width: 48)
                    }

                    Divider()

                    comparisonRow(L10n.calories, weekly: weekly.calories, monthly: monthly.calories, unit: "kcal", color: MacroColors.calories)
                    comparisonRow(L10n.protein, weekly: weekly.protein, monthly: monthly.protein, unit: "g", color: MacroColors.protein)
                    comparisonRow(L10n.carbs, weekly: weekly.carbs, monthly: monthly.carbs, unit: "g", color: MacroColors.carbs)
                    comparisonRow(L10n.fat, weekly: weekly.fat, monthly: monthly.fat, unit: "g", color: MacroColors.fat)
                    comparisonRow(L10n.fiber, weekly: weekly.fiber, monthly: monthly.fiber, unit: "g", color: MacroColors.fiber)
                }
            }
        }
    }

    private func comparisonRow(_ label: String, weekly: Double, monthly: Double, unit: String, color: Color) -> some View {
        let diff = weekly - monthly
        let diffPct = monthly > 0 ? (diff / monthly * 100) : 0
        let arrow = diff > 0 ? "\u{2191}" : (diff < 0 ? "\u{2193}" : "\u{2192}")
        let trendColor: Color = diff > 0 ? MacroColors.fiber : (diff < 0 ? MacroColors.protein : .secondary)

        return HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(Int(weekly)) \(unit)")
                .font(.caption)
                .frame(maxWidth: .infinity)
            Text("\(Int(monthly)) \(unit)")
                .font(.caption)
                .frame(maxWidth: .infinity)
            Text("\(arrow) \(Int(abs(diffPct)))%")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(trendColor)
                .frame(width: 48, alignment: .trailing)
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
