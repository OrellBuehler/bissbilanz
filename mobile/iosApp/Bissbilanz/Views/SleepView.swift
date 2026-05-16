import Charts
import SwiftUI

struct SleepView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var entries: [SleepEntry] = []
    @State private var isLoading = true
    @State private var showAddSheet = false
    @State private var editingEntry: SleepEntry?
    @State private var selectedRange = 30
    @State private var errorMessage: String?

    private enum RangeOption: Int, CaseIterable, Identifiable {
        case week = 7
        case month = 30
        case quarter = 90
        case all = 0

        var id: Int {
            rawValue
        }

        var label: String {
            switch self {
            case .week: "7d"
            case .month: "30d"
            case .quarter: "90d"
            case .all: L10n.history
            }
        }
    }

    private var chartEntries: [SleepEntry] {
        let sorted = entries.sorted { entryA, entryB in
            guard let dateA = DateFormatting.date(from: entryA.entryDate),
                  let dateB = DateFormatting.date(from: entryB.entryDate)
            else { return false }
            return dateA < dateB
        }
        guard selectedRange > 0 else { return sorted }
        let cutoff = Date().adding(days: -selectedRange)
        return sorted.filter { entry in
            guard let date = DateFormatting.date(from: entry.entryDate) else { return false }
            return date >= cutoff
        }
    }

    private var avgDurationMinutes: Double {
        guard !entries.isEmpty else { return 0 }
        return Double(entries.map(\.durationMinutes).reduce(0, +)) / Double(entries.count)
    }

    private var avgQuality: Double {
        guard !entries.isEmpty else { return 0 }
        return Double(entries.map(\.quality).reduce(0, +)) / Double(entries.count)
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if entries.isEmpty {
                    ContentUnavailableView(
                        L10n.sleep,
                        systemImage: "moon.zzz",
                        description: Text(L10n.noSleepEntries)
                    )
                } else {
                    List {
                        statsChipsSection
                        if chartEntries.count >= 2 { chartSection }
                        historySection
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle(L10n.sleep)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddSheet) {
                SleepEditSheet {
                    Task { await loadEntries() }
                }
            }
            .sheet(item: $editingEntry) { entry in
                SleepEditSheet(existingEntry: entry) {
                    Task { await loadEntries() }
                }
            }
            .refreshable { await loadEntries() }
            .task { await loadEntries() }
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
    }

    // MARK: - Stats Chips

    private var statsChipsSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    statChip(L10n.nightsLogged, value: "\(entries.count)", color: .indigo)

                    if !entries.isEmpty {
                        let hours = Int(avgDurationMinutes) / 60
                        let minutes = Int(avgDurationMinutes) % 60
                        statChip(L10n.avgDuration, value: "\(hours)h \(minutes)m", color: .blue)
                        statChip(L10n.avgQuality, value: String(format: "%.1f / 10", avgQuality), color: .purple)
                    }
                }
                .padding(.horizontal, 4)
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
        }
    }

    private func statChip(_ label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(color)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Chart Section

    private var chartSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.trend)
                    .font(.headline)

                Picker("Range", selection: $selectedRange) {
                    ForEach(RangeOption.allCases) { option in
                        Text(option.label).tag(option.rawValue)
                    }
                }
                .pickerStyle(.segmented)

                Chart {
                    ForEach(chartEntries) { entry in
                        if let date = DateFormatting.date(from: entry.entryDate) {
                            let hours = Double(entry.durationMinutes) / 60.0
                            BarMark(
                                x: .value("Date", date, unit: .day),
                                y: .value(L10n.sleepDuration, hours)
                            )
                            .foregroundStyle(.indigo.opacity(0.8))

                            PointMark(
                                x: .value("Date", date, unit: .day),
                                y: .value(L10n.sleepQuality, Double(entry.quality) * hours / 10.0)
                            )
                            .foregroundStyle(.purple)
                            .symbolSize(30)
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let h = value.as(Double.self) {
                                Text("\(h, specifier: "%.1f")h")
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                        AxisGridLine()
                    }
                }
                .frame(height: 200)

                // Legend
                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(.indigo.opacity(0.8))
                            .frame(width: 12, height: 12)
                        Text(L10n.sleepDuration).font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 4) {
                        Circle().fill(.purple).frame(width: 8, height: 8)
                        Text(L10n.sleepQuality).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - History Section

    private var historySection: some View {
        Section(L10n.history) {
            ForEach(entries) { entry in
                Button {
                    editingEntry = entry
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            if let date = DateFormatting.date(from: entry.entryDate) {
                                Text(DateFormatting.displayString(from: date))
                                    .font(.body)
                                    .foregroundStyle(.primary)
                            } else {
                                Text(entry.entryDate)
                                    .font(.body)
                                    .foregroundStyle(.primary)
                            }
                            if let notes = entry.notes, !notes.isEmpty {
                                Text(notes)
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            let hours = entry.durationMinutes / 60
                            let minutes = entry.durationMinutes % 60
                            Text("\(hours)h \(minutes)m")
                                .foregroundStyle(.secondary)
                            Text("Q \(entry.quality)/10")
                                .font(.caption2)
                                .foregroundStyle(.purple)
                        }
                    }
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await deleteEntry(entry) }
                    } label: {
                        Label(L10n.delete, systemImage: "trash")
                    }
                }
            }
        }
    }

    // MARK: - Data Loading

    private func loadEntries() async {
        isLoading = true
        entries = await (try? api.getSleepEntries()) ?? []
        isLoading = false
    }

    private func deleteEntry(_ entry: SleepEntry) async {
        do {
            try await api.deleteSleepEntry(id: entry.id)
            entries.removeAll { $0.id == entry.id }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
