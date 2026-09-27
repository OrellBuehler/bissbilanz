import SwiftUI

struct CalendarView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(GoalsRepository.self) private var goalsRepository

    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor

    @State private var currentMonth = Date()
    @State private var calendarDays: [CalendarDay] = []
    @State private var isLoading = true

    private var weekdayHeaders: [String] {
        L10n.weekdayHeaders
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    private var year: Int {
        Calendar.current.component(.year, from: currentMonth)
    }

    private var month: Int {
        Calendar.current.component(.month, from: currentMonth)
    }

    /// Date-string → day, so each grid cell is an O(1) lookup instead of a
    /// linear scan of `calendarDays` (the grid renders 28–42 cells per month).
    private var daysByDate: [String: CalendarDay] {
        Dictionary(calendarDays.map { ($0.date, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private var daysLogged: Int {
        calendarDays.count { $0.calories > 0 }
    }

    private var daysOnTarget: Int {
        calendarDays.count(where: \.metGoal)
    }

    private var avgCalories: Double {
        let logged = calendarDays.filter { $0.calories > 0 }
        guard !logged.isEmpty else { return 0 }
        return logged.reduce(0.0) { $0 + $1.calories } / Double(logged.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                monthNavigator

                calendarGrid

                if !calendarDays.isEmpty {
                    statsSection
                }

                legendSection
            }
            .padding()
        }
        .navigationTitle(L10n.calendar)
        .task { await loadData() }
        .onChange(of: currentMonth) { _, _ in
            Task { await loadData() }
        }
    }

    private var monthNavigator: some View {
        HStack {
            Button {
                currentMonth = currentMonth.adding(months: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(L10n.previousMonth)
            Spacer()
            Text(DateFormatting.monthYear(from: currentMonth))
                .font(.title3)
                .fontWeight(.semibold)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button {
                currentMonth = currentMonth.adding(months: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(L10n.nextMonth)
        }
    }

    private var calendarGrid: some View {
        VStack(spacing: 4) {
            // Weekday headers
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(weekdayHeaders, id: \.self) { day in
                    Text(day)
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            // Day cells
            LazyVGrid(columns: columns, spacing: 4) {
                let dayMap = daysByDate

                ForEach(CalendarGrid.cells(for: currentMonth)) { cell in
                    switch cell {
                    case .spacer:
                        Color.clear.frame(height: 52)
                    case let .day(dayNum, dateStr):
                        // Label-based link, like the dashboard's meal cards:
                        // a value-based link resolved through a
                        // `navigationDestination(for: String.self)` registration
                        // intermittently stops resolving on recent iOS releases and
                        // pushes the empty placeholder page — a black screen with a
                        // warning triangle — instead of the day log.
                        NavigationLink {
                            DayLogView(date: dateStr)
                        } label: {
                            dayCell(
                                dayNum: dayNum,
                                calendarDay: dayMap[dateStr],
                                isToday: dateStr == DateFormatting.today
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func dayCell(dayNum: Int, calendarDay: CalendarDay?, isToday: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text("\(dayNum)")
                .font(.caption)
                .fontWeight(isToday ? .bold : .medium)

            if let day = calendarDay, day.calories > 0 {
                Text("\(Int(day.calories))")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(cellColor(calendarDay))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            if isToday {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(.primary, lineWidth: 2)
            }
        }
        .overlay(alignment: .topTrailing) {
            dwcBadge(for: calendarDay)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(dayAccessibilityLabel(dayNum: dayNum, calendarDay: calendarDay, isToday: isToday))
    }

    /// Non-color cue for "met goal" vs "logged" vs "no data" when Differentiate
    /// Without Color is on — the cells otherwise only differ by tint.
    @ViewBuilder
    private func dwcBadge(for day: CalendarDay?) -> some View {
        if differentiateWithoutColor, let day, day.metGoal {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 8))
                .foregroundStyle(.primary)
                .padding(2)
                .accessibilityHidden(true)
        } else if differentiateWithoutColor, let day, day.calories > 0 {
            Image(systemName: "circle.fill")
                .font(.system(size: 5))
                .foregroundStyle(.primary)
                .padding(3)
                .accessibilityHidden(true)
        }
    }

    private func dayAccessibilityLabel(dayNum: Int, calendarDay: CalendarDay?, isToday: Bool) -> String {
        var parts = [String(dayNum)]
        if isToday { parts.append(L10n.today) }
        if let day = calendarDay, day.calories > 0 {
            parts.append(L10n.caloriesAmount(Int(day.calories)))
            if day.metGoal { parts.append(L10n.intentDayGoalMet) }
        } else {
            parts.append(L10n.noEntries)
        }
        return parts.joined(separator: ", ")
    }

    private func cellColor(_ day: CalendarDay?) -> Color {
        guard let day else { return Color(.systemGray6) }
        if day.metGoal { return MacroColors.fiber.opacity(0.3) }
        if day.calories > 0 { return MacroColors.calories.opacity(0.2) }
        return Color(.systemGray6)
    }

    private var statsSection: some View {
        HStack(spacing: 24) {
            statItem(label: L10n.daysLogged, value: "\(daysLogged)")
            statItem(label: L10n.daysOnTarget, value: "\(daysOnTarget)")
            statItem(label: L10n.avgCalories, value: "\(Int(avgCalories))")
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func statItem(label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(value)
    }

    private var legendSection: some View {
        HStack(spacing: 16) {
            legendItem(color: MacroColors.fiber.opacity(0.3), label: L10n.daysOnTarget, symbol: "checkmark.circle.fill")
            legendItem(color: MacroColors.calories.opacity(0.2), label: L10n.daysLogged, symbol: "circle.fill")
            legendItem(color: Color(.systemGray6), label: L10n.noData, symbol: nil)
        }
        .font(.caption2)
    }

    private func legendItem(color: Color, label: String, symbol: String?) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3)
                .fill(color)
                .frame(width: 12, height: 12)
                .overlay {
                    if differentiateWithoutColor, let symbol {
                        Image(systemName: symbol)
                            .font(.system(size: 7))
                            .foregroundStyle(.primary)
                    }
                }
                .accessibilityHidden(true)
            Text(label)
                .foregroundStyle(.secondary)
        }
    }

    private func loadData() async {
        isLoading = true
        if appModeManager.isLocal {
            // In Local mode the local store holds every entry, so the month
            // is aggregated locally instead of asking the server.
            calendarDays = entryRepository.calendarDays(
                year: year,
                month: month,
                calorieGoal: goalsRepository.goals()?.calorieGoal
            )
        } else {
            do {
                try? await goalsRepository.refresh()
                let days = try await api.getCalendarStats(month: month, year: year)
                calendarDays = CalendarDay.days(
                    from: days,
                    calorieGoal: goalsRepository.goals()?.calorieGoal
                )
            } catch {
                ErrorReporter.captureWarning("Calendar stats fetch failed", context: ["reason": ErrorReporter.reason(for: error)])
                calendarDays = []
            }
        }
        isLoading = false
    }
}
