import Charts
import SwiftUI

struct WeightView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var entries: [WeightEntry] = []
    @State private var isLoading = true
    @State private var showAddSheet = false
    @State private var editingEntry: WeightEntry?
    @State private var selectedRange = 30

    private enum RangeOption: Int, CaseIterable, Identifiable {
        case week = 7
        case month = 30
        case quarter = 90
        case all = 0

        var id: Int { rawValue }

        var label: String {
            switch self {
            case .week: return "7d"
            case .month: return "30d"
            case .quarter: return "90d"
            case .all: return L10n.history
            }
        }
    }

    private var chartEntries: [WeightEntry] {
        let sorted = entries.sorted { entryA, entryB in
            guard let dateA = DateFormatting.date(from: entryA.entryDate),
                  let dateB = DateFormatting.date(from: entryB.entryDate) else { return false }
            return dateA < dateB
        }
        guard selectedRange > 0 else { return sorted }
        let cutoff = Date().adding(days: -selectedRange)
        return sorted.filter { entry in
            guard let date = DateFormatting.date(from: entry.entryDate) else { return false }
            return date >= cutoff
        }
    }

    private var movingAverageData: [(date: Date, average: Double)] {
        let sorted = chartEntries
        guard sorted.count >= 2 else { return [] }

        var result: [(date: Date, average: Double)] = []
        for (index, entry) in sorted.enumerated() {
            guard let date = DateFormatting.date(from: entry.entryDate) else { continue }
            let windowStart = max(0, index - 6)
            let window = sorted[windowStart...index]
            let avg = window.map(\.weightKg).reduce(0, +) / Double(window.count)
            result.append((date: date, average: avg))
        }
        return result
    }

    private var weightRange: ClosedRange<Double> {
        let weights = chartEntries.map(\.weightKg)
        guard let minW = weights.min(), let maxW = weights.max() else {
            return 0...100
        }
        let padding = max((maxW - minW) * 0.15, 0.5)
        return (minW - padding)...(maxW + padding)
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if entries.isEmpty {
                    ContentUnavailableView(
                        L10n.weight,
                        systemImage: "scalemass",
                        description: Text(L10n.noEntriesYet)
                    )
                } else {
                    List {
                        if let latest = entries.first {
                            currentWeightSection(latest)
                        }

                        if chartEntries.count >= 2 {
                            chartSection
                        }

                        historySection
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle(L10n.weight)
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
                AddWeightSheet {
                    Task { await loadEntries() }
                }
            }
            .sheet(item: $editingEntry) { entry in
                AddWeightSheet(existingEntry: entry) {
                    Task { await loadEntries() }
                }
            }
            .refreshable { await loadEntries() }
            .task { await loadEntries() }
        }
    }

    // MARK: - Current Weight Section

    private func currentWeightSection(_ latest: WeightEntry) -> some View {
        Section {
            HStack {
                VStack(alignment: .leading) {
                    Text(L10n.current)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(latest.weightKg, specifier: "%.1f") kg")
                        .font(.title)
                        .fontWeight(.bold)
                }
                Spacer()
                if entries.count >= 2 {
                    let diff = latest.weightKg - entries[1].weightKg
                    VStack(alignment: .trailing) {
                        Text(L10n.change)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 2) {
                            Image(systemName: diff >= 0 ? "arrow.up" : "arrow.down")
                            Text("\(abs(diff), specifier: "%.1f") kg")
                        }
                        .font(.subheadline)
                        .foregroundStyle(diff >= 0 ? .red : .green)
                    }
                }
            }
        }
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
                            LineMark(
                                x: .value("Date", date),
                                y: .value(L10n.weight, entry.weightKg)
                            )
                            .foregroundStyle(.blue)
                            .interpolationMethod(.catmullRom)

                            PointMark(
                                x: .value("Date", date),
                                y: .value(L10n.weight, entry.weightKg)
                            )
                            .foregroundStyle(.blue)
                            .symbolSize(30)
                        }
                    }

                    ForEach(Array(movingAverageData.enumerated()), id: \.offset) { _, dataPoint in
                        LineMark(
                            x: .value("Date", dataPoint.date),
                            y: .value("Avg", dataPoint.average),
                            series: .value("Series", "moving_avg")
                        )
                        .foregroundStyle(.orange.opacity(0.8))
                        .lineStyle(StrokeStyle(lineWidth: 2, dash: [6, 3]))
                        .interpolationMethod(.catmullRom)
                    }
                }
                .chartYScale(domain: weightRange)
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let kg = value.as(Double.self) {
                                Text("\(kg, specifier: "%.1f")")
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { value in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                        AxisGridLine()
                    }
                }
                .frame(height: 200)

                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Circle().fill(.blue).frame(width: 8, height: 8)
                        Text(L10n.weight).font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(.orange)
                            .frame(width: 16, height: 2)
                        Text("7d avg").font(.caption2).foregroundStyle(.secondary)
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
                        Text("\(entry.weightKg, specifier: "%.1f") kg")
                            .foregroundStyle(.secondary)
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
        do {
            entries = try await api.getWeightEntries()
        } catch {
            entries = []
        }
        isLoading = false
    }

    private func deleteEntry(_ entry: WeightEntry) async {
        do {
            try await api.deleteWeightEntry(id: entry.id)
            entries.removeAll { $0.id == entry.id }
        } catch {}
    }
}

// MARK: - Add / Edit Weight Sheet

struct AddWeightSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let existingEntry: WeightEntry?
    let onSaved: () -> Void

    @State private var weight = ""
    @State private var date = Date()
    @State private var notes = ""
    @State private var isSaving = false

    init(existingEntry: WeightEntry? = nil, onSaved: @escaping () -> Void) {
        self.existingEntry = existingEntry
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.weight) {
                    HStack {
                        TextField(L10n.weight, text: $weight)
                            .keyboardType(.decimalPad)
                        Text("kg")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    DatePicker(L10n.today, selection: $date, displayedComponents: .date)
                }

                Section {
                    TextField("Notes", text: $notes)
                }
            }
            .navigationTitle(existingEntry != nil ? L10n.edit : L10n.logWeight)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(weight.isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        guard let entry = existingEntry else { return }
        weight = "\(entry.weightKg)"
        notes = entry.notes ?? ""
        if let d = DateFormatting.date(from: entry.entryDate) {
            date = d
        }
    }

    private func save() async {
        guard let kg = Double(weight) else { return }
        isSaving = true
        let dateStr = DateFormatting.isoString(from: date)

        do {
            if let existing = existingEntry {
                let update = WeightUpdate(
                    weightKg: kg,
                    entryDate: dateStr,
                    notes: notes.isEmpty ? nil : notes
                )
                _ = try await api.updateWeightEntry(id: existing.id, update)
            } else {
                let entry = WeightCreate(
                    weightKg: kg,
                    entryDate: dateStr,
                    notes: notes.isEmpty ? nil : notes
                )
                _ = try await api.createWeightEntry(entry)
            }
            onSaved()
            dismiss()
        } catch {}
        isSaving = false
    }
}
