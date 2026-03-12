import SwiftUI

struct CalendarView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var currentMonth = Date()
    @State private var calendarDays: [CalendarDay] = []
    @State private var isLoading = true

    private let weekdayHeaders = ["M", "T", "W", "T", "F", "S", "S"]
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    private var year: Int { Calendar.current.component(.year, from: currentMonth) }
    private var month: Int { Calendar.current.component(.month, from: currentMonth) }

    private var daysLogged: Int { calendarDays.filter { $0.calories > 0 }.count }
    private var daysOnTarget: Int { calendarDays.filter { $0.metGoal }.count }
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
            Spacer()
            Text(DateFormatting.monthYear(from: currentMonth))
                .font(.title3)
                .fontWeight(.semibold)
            Spacer()
            Button {
                currentMonth = currentMonth.adding(months: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .frame(width: 44, height: 44)
            }
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
                let offset = currentMonth.weekdayOffset
                let daysInMonth = currentMonth.daysInMonth

                ForEach(0..<(offset + daysInMonth), id: \.self) { index in
                    if index < offset {
                        Color.clear.frame(height: 52)
                    } else {
                        let dayNum = index - offset + 1
                        let dateStr = String(format: "%04d-%02d-%02d", year, month, dayNum)
                        let calDay = calendarDays.first { $0.date == dateStr }

                        NavigationLink(value: dateStr) {
                            dayCell(dayNum: dayNum, calendarDay: calDay)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationDestination(for: String.self) { date in
            DayLogView(date: date)
        }
    }

    private func dayCell(dayNum: Int, calendarDay: CalendarDay?) -> some View {
        VStack(spacing: 2) {
            Text("\(dayNum)")
                .font(.caption)
                .fontWeight(.medium)

            if let day = calendarDay, day.calories > 0 {
                Text("\(Int(day.calories))")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(cellColor(calendarDay))
        .clipShape(RoundedRectangle(cornerRadius: 8))
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
            statItem(label: "Avg Cal", value: "\(Int(avgCalories))")
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
    }

    private var legendSection: some View {
        HStack(spacing: 16) {
            legendItem(color: MacroColors.fiber.opacity(0.3), label: L10n.daysOnTarget)
            legendItem(color: MacroColors.calories.opacity(0.2), label: L10n.daysLogged)
            legendItem(color: Color(.systemGray6), label: "No data")
        }
        .font(.caption2)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3)
                .fill(color)
                .frame(width: 12, height: 12)
            Text(label)
                .foregroundStyle(.secondary)
        }
    }

    private func loadData() async {
        isLoading = true
        do {
            calendarDays = try await api.getCalendarStats(month: month, year: year)
        } catch {
            calendarDays = []
        }
        isLoading = false
    }
}
