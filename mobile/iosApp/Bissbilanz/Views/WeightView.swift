import Charts
import shared
import SwiftUI

/// Bridges Swift `Double` arrays to/from the boxed-number arrays the shared
/// Kotlin analytics expose across the Objective-C interop boundary.
private extension [Double] {
    var asKotlin: [KotlinDouble] {
        map { KotlinDouble(double: $0) }
    }
}

private extension [KotlinDouble] {
    var asDoubles: [Double] {
        map(\.doubleValue)
    }
}

/// Direction of the recent weight development shown in the trend card.
enum WeightTrend: Equatable {
    case rising(Double)
    case falling(Double)
    case steady(Double?)

    /// Weekly changes inside this band are daily fluctuation noise, not a trend.
    static let steadyBandKg = 0.3

    static func from(delta: Double?) -> WeightTrend {
        guard let delta else { return .steady(nil) }
        // Classification lives in the shared KMP analytics so iOS and Android
        // agree on what counts as a real trend vs. daily-fluctuation noise.
        switch WeightChartAnalyticsKt.classifyWeightTrend(deltaKg: delta, steadyBandKg: steadyBandKg) {
        case .rising: return .rising(delta)
        case .falling: return .falling(delta)
        // SKIE exports the enum as non-frozen, so a `default` keeps the switch
        // exhaustive across Swift toolchains (Xcode 16's 6.1 and CI's 6.2).
        default: return .steady(delta)
        }
    }

    /// Local fallback for the server's `delta_7d` (Local mode / offline):
    /// average of the entries in the 7 days up to the newest entry vs the
    /// 7 days before that. Averaging smooths the day-to-day fluctuation a
    /// point-to-point delta would amplify.
    static func localDelta7d(entries: [WeightEntry]) -> Double? {
        let dated = entries.compactMap { entry -> (date: Date, kg: Double)? in
            guard let date = DateFormatting.date(from: entry.entryDate) else { return nil }
            return (date, entry.weightKg)
        }
        guard let latest = dated.map(\.date).max() else { return nil }
        var recent: [Double] = []
        var previous: [Double] = []
        for sample in dated {
            let days = latest.timeIntervalSince(sample.date) / 86400
            if days < 7 {
                recent.append(sample.kg)
            } else if days < 14 {
                previous.append(sample.kg)
            }
        }
        guard !recent.isEmpty, !previous.isEmpty else { return nil }
        return recent.reduce(0, +) / Double(recent.count) - previous.reduce(0, +) / Double(previous.count)
    }

    var delta: Double? {
        switch self {
        case let .rising(delta), let .falling(delta):
            delta
        case let .steady(delta):
            delta
        }
    }
}

extension WeightTrend {
    var icon: String {
        switch self {
        case .rising: "arrow.up.right"
        case .falling: "arrow.down.right"
        case .steady: "arrow.right"
        }
    }

    var label: String {
        switch self {
        case .rising: L10n.trendRising
        case .falling: L10n.trendFalling
        case .steady: L10n.trendSteady
        }
    }

    var color: Color {
        switch self {
        case .rising: .red
        case .falling: .green
        case .steady: .secondary
        }
    }
}

struct WeightView: View {
    @Environment(WeightRepository.self) private var weightRepository
    /// Weight stats are server-computed — they stay on the direct API and
    /// are skipped in Local mode.
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appModeManager

    @State private var entries: [WeightEntry] = []
    @State private var weightStats: WeightStatsResponse?
    @State private var isLoading = true
    @State private var showAddSheet = false
    @State private var editingEntry: WeightEntry?
    @State private var selectedRange = 30
    @State private var errorMessage: String?
    @State private var showProjection = false
    @State private var projectionDays = 30

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

    private var chartEntries: [WeightEntry] {
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

    private var movingAverageData: [(date: Date, average: Double)] {
        let sorted = chartEntries
        guard sorted.count >= 2 else { return [] }

        // 7-point trailing average (with partial leading windows) computed by the
        // shared KMP analytics; the chart only assembles the dates around it.
        let averages = WeightChartAnalyticsKt.weightMovingAverage(
            values: sorted.map(\.weightKg).asKotlin,
            window: 7
        ).asDoubles

        var result: [(date: Date, average: Double)] = []
        for (index, entry) in sorted.enumerated() {
            guard let date = DateFormatting.date(from: entry.entryDate) else { continue }
            result.append((date: date, average: averages[index]))
        }
        return result
    }

    private var projectionData: [(date: Date, weight: Double)] {
        guard showProjection, chartEntries.count >= 3 else { return [] }
        let sorted = chartEntries.compactMap { entry -> (Date, Double)? in
            guard let date = DateFormatting.date(from: entry.entryDate) else { return nil }
            return (date, entry.weightKg)
        }.sorted { $0.0 < $1.0 }
        guard let firstDate = sorted.first?.0, let lastDate = sorted.last?.0 else { return [] }

        // Least-squares fit on real day offsets (not entry index) so unevenly
        // spaced weigh-ins project at the correct rate — matching the web chart.
        let dayOffset = { (d: Date) in d.timeIntervalSince(firstDate) / 86400 }
        let fit = WeightChartAnalyticsKt.linearRegression(
            xs: sorted.map { dayOffset($0.0) }.asKotlin,
            ys: sorted.map(\.1).asKotlin
        )
        guard let fit else { return [] }
        let slope = fit.slope
        let intercept = fit.intercept

        var result: [(Date, Double)] = []
        // Start from the last actual data point's day offset.
        let lastX = dayOffset(lastDate)
        result.append((lastDate, slope * lastX + intercept))
        for day in 1 ... projectionDays {
            let futureDate = lastDate.adding(days: day)
            let futureWeight = slope * (lastX + Double(day)) + intercept
            result.append((futureDate, futureWeight))
        }
        return result
    }

    private var weightRange: ClosedRange<Double> {
        var weights = chartEntries.map(\.weightKg)
        weights.append(contentsOf: projectionData.map(\.weight))
        guard let minW = weights.min(), let maxW = weights.max() else {
            return 0 ... 100
        }
        let padding = max((maxW - minW) * 0.15, 0.5)
        return (minW - padding) ... (maxW + padding)
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
                        statsChipsSection
                        if chartEntries.count >= 2 { chartSection }
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
                    .accessibilityLabel(L10n.logWeight)
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
            .task { await loadEntries(showSpinner: true) }
            // Cheap local re-read when popping back from the history subpage,
            // where entries can be edited or deleted.
            .onAppear { entries = weightRepository.entries() }
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

    // MARK: - Summary Cards

    /// The trend card prefers the server's smoothed 7-day delta and falls
    /// back to the local computation in Local mode or offline.
    private var trend: WeightTrend {
        WeightTrend.from(delta: weightStats?.delta7d ?? WeightTrend.localDelta7d(entries: entries))
    }

    /// Top row: latest weight and trend direction side by side as floating
    /// cards (no list container). Server projections follow as chips.
    private var statsChipsSection: some View {
        Section {
            HStack(spacing: 12) {
                latestCard
                trendCard
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if let stats = weightStats,
               stats.projected14d != nil || stats.projected30d != nil || stats.projected60d != nil
            {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        if let p14 = stats.projected14d {
                            statChip(L10n.projection14d, value: String(format: "%.1f kg", p14), color: .purple)
                        }
                        if let p30 = stats.projected30d {
                            statChip(L10n.projection30d, value: String(format: "%.1f kg", p30), color: .purple)
                        }
                        if let p60 = stats.projected60d {
                            statChip(L10n.projection60d, value: String(format: "%.1f kg", p60), color: .purple)
                        }
                    }
                    .padding(.horizontal, 4)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        }
    }

    private var latestCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(L10n.latestWeight)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(String(format: "%.1f kg", entries.first?.weightKg ?? 0))
                .font(.title2)
                .fontWeight(.bold)
                .monospacedDigit()
                .contentTransition(.numericText(value: entries.first?.weightKg ?? 0))
                .foregroundStyle(.blue)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(latestDateText)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.blue.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var latestDateText: String {
        guard let latest = entries.first else { return "" }
        if let date = DateFormatting.date(from: latest.entryDate) {
            return DateFormatting.displayString(from: date)
        }
        return latest.entryDate
    }

    private var trendCard: some View {
        let trend = trend
        return VStack(alignment: .leading, spacing: 4) {
            Text(L10n.trendWeight)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Image(systemName: trend.icon)
                Text(trend.label)
            }
            .font(.title2)
            .fontWeight(.bold)
            .foregroundStyle(trend.color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            Text(trend.delta.map { L10n.deltaPerWeek(String(format: "%+.1f kg", $0)) } ?? "—")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(trend.color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
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

                    if showProjection {
                        ForEach(Array(projectionData.enumerated()), id: \.offset) { _, dataPoint in
                            LineMark(
                                x: .value("Date", dataPoint.date),
                                y: .value("Proj", dataPoint.weight),
                                series: .value("Series", "projection")
                            )
                            .foregroundStyle(.purple.opacity(0.6))
                            .lineStyle(StrokeStyle(lineWidth: 2, dash: [4, 4]))
                            .interpolationMethod(.linear)
                        }
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
                    AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                        AxisGridLine()
                    }
                }
                .frame(height: 200)

                // Projection toggle
                HStack {
                    Toggle(L10n.projected, isOn: $showProjection)
                        .font(.caption)

                    if showProjection {
                        Picker("", selection: $projectionDays) {
                            Text(L10n.projection14d).tag(14)
                            Text(L10n.projection30d).tag(30)
                            Text(L10n.projection60d).tag(60)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 180)
                    }
                }

                // Legend
                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Circle().fill(.blue).frame(width: 8, height: 8)
                        Text(L10n.weight).font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(.orange)
                            .frame(width: 16, height: 2)
                        Text(L10n.movingAverage7d).font(.caption2).foregroundStyle(.secondary)
                    }
                    if showProjection {
                        HStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 1)
                                .fill(.purple)
                                .frame(width: 16, height: 2)
                            Text(L10n.projected).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - History Section

    private static let historyPreviewCount = 5

    private var historySection: some View {
        Section(L10n.history) {
            ForEach(entries.prefix(Self.historyPreviewCount)) { entry in
                WeightEntryRow(entry: entry) {
                    editingEntry = entry
                } onDelete: {
                    Task { await deleteEntry(entry) }
                }
            }
            if entries.count > Self.historyPreviewCount {
                NavigationLink {
                    WeightHistoryView()
                } label: {
                    HStack {
                        Text(L10n.showAll)
                        Spacer()
                        Text("\(entries.count)")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Data Loading

    /// showSpinner only on first load: flipping isLoading during pull-to-refresh
    /// swaps the List out for LoadingView, which kills the refresh gesture and
    /// leaves the spinner stuck.
    private func loadEntries(showSpinner: Bool = false) async {
        entries = weightRepository.entries()
        if showSpinner { isLoading = entries.isEmpty }

        try? await weightRepository.refresh()
        if !appModeManager.isLocal {
            weightStats = try? await api.getWeightStats()
        }
        entries = weightRepository.entries()

        isLoading = false

        if UserDefaults.standard.bool(forKey: HealthKitService.syncEnabledKey) {
            await importFromHealthKit()
        }
    }

    /// Import weights from Apple Health that the app doesn't have yet
    /// (read-only — never writes back to Health from here).
    private func importFromHealthKit() async {
        let healthKit = HealthKitService.shared
        guard healthKit.isAvailable else { return }
        let since = Date().adding(days: -90)
        guard let samples = try? await healthKit.fetchWeights(since: since), !samples.isEmpty else { return }

        let existingDates = Set(entries.map(\.entryDate))
        // Latest sample per day wins
        var latestPerDay: [String: HealthKitService.WeightSample] = [:]
        for sample in samples {
            let day = DateFormatting.isoString(from: sample.date)
            if let current = latestPerDay[day], current.date > sample.date { continue }
            latestPerDay[day] = sample
        }

        var imported = false
        for (day, sample) in latestPerDay where !existingDates.contains(day) {
            let kg = (sample.weightKg * 100).rounded() / 100
            let create = WeightCreate(weightKg: kg, entryDate: day, notes: nil)
            if await (try? weightRepository.createEntry(create)) != nil {
                imported = true
            }
        }

        if imported {
            entries = weightRepository.entries()
            if !appModeManager.isLocal {
                weightStats = await (try? api.getWeightStats()) ?? weightStats
            }
        }
    }

    private func deleteEntry(_ entry: WeightEntry) async {
        do {
            try await weightRepository.deleteEntry(id: entry.id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }
        entries = weightRepository.entries()
    }
}

// MARK: - Entry Row

/// One history row — shared by the preview list on the weight page and the
/// full history subpage.
struct WeightEntryRow: View {
    let entry: WeightEntry
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onEdit) {
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
            Button(role: .destructive, action: onDelete) {
                Label(L10n.delete, systemImage: "trash")
            }
        }
    }
}

// MARK: - Full History

/// All weight entries, loaded page-wise from the local store as the list
/// scrolls — List rows are lazy, so reaching the last loaded row triggers
/// the next page fetch.
struct WeightHistoryView: View {
    @Environment(WeightRepository.self) private var weightRepository

    @State private var entries: [WeightEntry] = []
    @State private var hasMore = true
    @State private var editingEntry: WeightEntry?
    @State private var errorMessage: String?

    private static let pageSize = 50

    var body: some View {
        List {
            ForEach(entries) { entry in
                WeightEntryRow(entry: entry) {
                    editingEntry = entry
                } onDelete: {
                    Task { await deleteEntry(entry) }
                }
                .onAppear {
                    if entry.id == entries.last?.id {
                        loadNextPage()
                    }
                }
            }
        }
        .navigationTitle(L10n.history)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if entries.isEmpty { loadNextPage() }
        }
        .sheet(item: $editingEntry) { entry in
            AddWeightSheet(existingEntry: entry) {
                reloadLoadedWindow()
            }
        }
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func loadNextPage() {
        guard hasMore else { return }
        let page = weightRepository.entries(offset: entries.count, limit: Self.pageSize)
        entries += page
        hasMore = page.count == Self.pageSize
    }

    /// Re-reads everything loaded so far in one fetch — an edit can change an
    /// entry's date and therefore its position in the ordering.
    private func reloadLoadedWindow() {
        let limit = max(entries.count, Self.pageSize)
        entries = weightRepository.entries(offset: 0, limit: limit)
        hasMore = entries.count == limit
    }

    private func deleteEntry(_ entry: WeightEntry) async {
        do {
            try await weightRepository.deleteEntry(id: entry.id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            entries.removeAll { $0.id == entry.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Add / Edit Weight Sheet

struct AddWeightSheet: View {
    @Environment(WeightRepository.self) private var weightRepository
    @Environment(\.dismiss) private var dismiss

    let existingEntry: WeightEntry?
    let onSaved: () -> Void

    @State private var weight = ""
    @State private var date = Date()
    @State private var notes = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

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
                    TextField(L10n.notes, text: $notes)
                }
            }
            .keyboardDismissable()
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
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func writeToHealthIfEnabled(kg: Double) async {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: HealthKitService.syncEnabledKey),
              defaults.bool(forKey: HealthKitService.writeWeightEnabledKey),
              HealthKitService.shared.isAvailable
        else { return }
        // Best effort — the user may have denied write permission in Health
        try? await HealthKitService.shared.saveWeight(kg, date: date)
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
        guard let kg = Double.parseUserInput(weight) else { return }
        isSaving = true
        let dateStr = DateFormatting.isoString(from: date)

        do {
            if let existing = existingEntry {
                let update = WeightUpdate(
                    weightKg: kg,
                    entryDate: dateStr,
                    notes: notes.isEmpty ? nil : notes
                )
                try await weightRepository.updateEntry(id: existing.id, update)
            } else {
                let entry = WeightCreate(
                    weightKg: kg,
                    entryDate: dateStr,
                    notes: notes.isEmpty ? nil : notes
                )
                try await weightRepository.createEntry(entry)
                await writeToHealthIfEnabled(kg: kg)
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
