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
    @State private var calendarDays: [CalendarDay] = []
    @State private var goals: Goals?
    @State private var selectedRange = 7
    @State private var isLoading = true
    @State private var calendarMonth = Date()

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
                        macroRadarCard
                        mealBreakdownChart
                        goalAchievementCard
                        calendarHeatmapCard
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
            Text("90d").tag(90)
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
                        .interpolationMethod(.catmullRom)

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
                Text("\(L10n.average): \(Int(avg)) \(unit)")
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

    // MARK: - Macro Radar Chart

    @ViewBuilder
    private var macroRadarCard: some View {
        if let goals, !dailyStats.isEmpty {
            let avgCal = dailyStats.map(\.calories).reduce(0, +) / Double(dailyStats.count)
            let avgP = dailyStats.map(\.protein).reduce(0, +) / Double(dailyStats.count)
            let avgC = dailyStats.map(\.carbs).reduce(0, +) / Double(dailyStats.count)
            let avgF = dailyStats.map(\.fat).reduce(0, +) / Double(dailyStats.count)
            let avgFb = dailyStats.map(\.fiber).reduce(0, +) / Double(dailyStats.count)

            let axes: [(String, Double, Color)] = [
                (L10n.calories, goals.calorieGoal > 0 ? avgCal / goals.calorieGoal : 0, MacroColors.calories),
                (L10n.protein, goals.proteinGoal > 0 ? avgP / goals.proteinGoal : 0, MacroColors.protein),
                (L10n.carbs, goals.carbGoal > 0 ? avgC / goals.carbGoal : 0, MacroColors.carbs),
                (L10n.fat, goals.fatGoal > 0 ? avgF / goals.fatGoal : 0, MacroColors.fat),
                (L10n.fiber, goals.fiberGoal > 0 ? avgFb / goals.fiberGoal : 0, MacroColors.fiber),
            ]

            CardView {
                VStack(alignment: .leading, spacing: 12) {
                    Label(L10n.macroBalance, systemImage: "pentagon")
                        .font(.headline)

                    MacroRadarView(axes: axes)
                        .frame(height: 200)
                }
            }
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

    // MARK: - Calendar Heatmap

    @ViewBuilder
    private var calendarHeatmapCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label(L10n.calendarHeatmap, systemImage: "calendar")
                        .font(.headline)
                    Spacer()
                    Button {
                        calendarMonth = calendarMonth.adding(months: -1)
                        Task { await loadCalendar() }
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    Text(DateFormatting.monthYear(from: calendarMonth))
                        .font(.caption)
                        .fontWeight(.medium)
                    Button {
                        calendarMonth = calendarMonth.adding(months: 1)
                        Task { await loadCalendar() }
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                }

                // Weekday headers
                HStack(spacing: 0) {
                    ForEach(L10n.weekdayHeaders, id: \.self) { header in
                        Text(header)
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }
                }

                // Calendar grid
                let startOfMonth = calendarMonth.startOfMonth
                let daysInMonth = calendarMonth.daysInMonth
                let offset = startOfMonth.weekdayOffset
                let dayMap = Dictionary(uniqueKeysWithValues: calendarDays.map { ($0.date, $0) })

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
                    ForEach(0..<offset, id: \.self) { _ in
                        Color.clear.frame(height: 28)
                    }
                    ForEach(1...daysInMonth, id: \.self) { day in
                        let date = Calendar.current.date(byAdding: .day, value: day - 1, to: startOfMonth)
                        let dateStr = date.map { DateFormatting.isoString(from: $0) } ?? ""
                        let calDay = dayMap[dateStr]

                        RoundedRectangle(cornerRadius: 4)
                            .fill(calendarDayColor(calDay))
                            .frame(height: 28)
                            .overlay {
                                Text("\(day)")
                                    .font(.caption2)
                                    .foregroundStyle(calDay != nil ? .white : .primary)
                            }
                    }
                }

                // Legend
                HStack(spacing: 16) {
                    legendItem(color: .green, label: L10n.onTarget)
                    legendItem(color: MacroColors.calories, label: L10n.hasEntries)
                    legendItem(color: Color(.systemGray5), label: L10n.noData)
                }
                .font(.caption2)
            }
        }
    }

    private func calendarDayColor(_ day: CalendarDay?) -> Color {
        guard let day else { return Color(.systemGray5) }
        if day.metGoal { return .green }
        if day.calories > 0 { return MacroColors.calories }
        return Color(.systemGray5)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 10, height: 10)
            Text(label)
                .foregroundStyle(.secondary)
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
        await loadCalendar()
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

    private func loadCalendar() async {
        let components = Calendar.current.dateComponents([.month, .year], from: calendarMonth)
        calendarDays = (try? await api.getCalendarStats(month: components.month ?? 1, year: components.year ?? 2026)) ?? []
    }
}

// MARK: - Macro Radar View

struct MacroRadarView: View {
    let axes: [(String, Double, Color)] // (label, ratio to goal, color)

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = min(geo.size.width, geo.size.height) / 2 - 24
            let count = axes.count

            Canvas { context, _ in
                // Draw concentric pentagons (25%, 50%, 75%, 100%)
                for level in [0.25, 0.5, 0.75, 1.0] {
                    let path = polygonPath(center: center, radius: radius * level, sides: count)
                    context.stroke(path, with: .color(.gray.opacity(0.2)), lineWidth: 1)
                }

                // Draw axes
                for i in 0..<count {
                    let angle = angleFor(index: i, total: count)
                    let point = pointAt(center: center, radius: radius, angle: angle)
                    var path = Path()
                    path.move(to: center)
                    path.addLine(to: point)
                    context.stroke(path, with: .color(.gray.opacity(0.15)), lineWidth: 1)
                }

                // Draw filled data polygon
                var dataPath = Path()
                for i in 0..<count {
                    let ratio = min(axes[i].1, 1.5)
                    let angle = angleFor(index: i, total: count)
                    let point = pointAt(center: center, radius: radius * ratio, angle: angle)
                    if i == 0 {
                        dataPath.move(to: point)
                    } else {
                        dataPath.addLine(to: point)
                    }
                }
                dataPath.closeSubpath()

                context.fill(dataPath, with: .color(.blue.opacity(0.15)))
                context.stroke(dataPath, with: .color(.blue), lineWidth: 2)
            }

            // Draw labels
            ForEach(0..<count, id: \.self) { i in
                let angle = angleFor(index: i, total: count)
                let labelRadius = radius + 16
                let point = pointAt(center: center, radius: labelRadius, angle: angle)
                let pct = Int(min(axes[i].1, 2.0) * 100)

                Text("\(axes[i].0)\n\(pct)%")
                    .font(.system(size: 9))
                    .fontWeight(.medium)
                    .foregroundStyle(axes[i].2)
                    .multilineTextAlignment(.center)
                    .position(point)
            }
        }
    }

    private func angleFor(index: Int, total: Int) -> Double {
        let slice = 2 * .pi / Double(total)
        return slice * Double(index) - .pi / 2
    }

    private func pointAt(center: CGPoint, radius: Double, angle: Double) -> CGPoint {
        CGPoint(
            x: center.x + radius * cos(angle),
            y: center.y + radius * sin(angle)
        )
    }

    private func polygonPath(center: CGPoint, radius: Double, sides: Int) -> Path {
        var path = Path()
        for i in 0..<sides {
            let angle = angleFor(index: i, total: sides)
            let point = pointAt(center: center, radius: radius, angle: angle)
            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }
}

// MARK: - Card View

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
