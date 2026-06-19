import Charts
import SwiftUI

/// Sleep duration in "7h 30m" form — shared by the cards, rows and chart.
func formatSleepDuration(_ minutes: Int) -> String {
    let hours = minutes / 60
    let remainder = minutes % 60
    return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
}

struct SleepView: View {
    @Environment(SleepRepository.self) private var sleepRepository

    @State private var entries: [SleepEntry] = []
    @State private var isLoading = true
    @State private var showAddSheet = false
    @State private var editingEntry: SleepEntry?
    @State private var selectedRange = 30
    @State private var errorMessage: String?

    /// Imported Health nights carry no subjective rating — they get the
    /// neutral middle of the 1–10 scale, editable afterwards.
    static let importedQuality = 5

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

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if entries.isEmpty {
                    ContentUnavailableView(
                        L10n.sleep,
                        systemImage: "bed.double",
                        description: Text(L10n.noEntriesYet)
                    )
                } else {
                    List {
                        statsSection
                        if chartEntries.count >= 2 { chartSection }
                        historySection
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle(L10n.sleep)
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
                AddSleepSheet {
                    Task { await loadEntries() }
                }
            }
            .sheet(item: $editingEntry) { entry in
                AddSleepSheet(existingEntry: entry) {
                    Task { await loadEntries() }
                }
            }
            .refreshable { await loadEntries() }
            .task { await loadEntries(showSpinner: true) }
            // Cheap local re-read when popping back from the history subpage,
            // where entries can be edited or deleted.
            .onAppear { entries = sleepRepository.entries() }
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

    /// Entries from the last 7 calendar days, backing the average card.
    private var recentEntries: [SleepEntry] {
        let cutoff = Date().adding(days: -7)
        return entries.filter { entry in
            guard let date = DateFormatting.date(from: entry.entryDate) else { return false }
            return date >= cutoff
        }
    }

    private var statsSection: some View {
        Section {
            HStack(spacing: 12) {
                lastNightCard
                averageCard
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
    }

    private var lastNightCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(L10n.lastNight)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(formatSleepDuration(entries.first?.durationMinutes ?? 0))
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(.indigo)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(latestDateText)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.indigo.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var latestDateText: String {
        guard let latest = entries.first else { return "" }
        if let date = DateFormatting.date(from: latest.entryDate) {
            return DateFormatting.displayString(from: date)
        }
        return latest.entryDate
    }

    private var averageCard: some View {
        let recent = recentEntries
        let avgMinutes = recent.isEmpty
            ? 0
            : recent.map(\.durationMinutes).reduce(0, +) / recent.count
        let avgQuality = recent.isEmpty
            ? 0
            : Double(recent.map(\.quality).reduce(0, +)) / Double(recent.count)
        return VStack(alignment: .leading, spacing: 4) {
            Text(L10n.sevenDayAverage)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(recent.isEmpty ? "—" : formatSleepDuration(avgMinutes))
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(.purple)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(recent.isEmpty ? "" : "\(L10n.sleepQuality) \(String(format: "%.1f", avgQuality))/10")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.purple.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
                            BarMark(
                                x: .value("Date", date, unit: .day),
                                y: .value(L10n.sleepDuration, Double(entry.durationMinutes) / 60)
                            )
                            .foregroundStyle(.indigo)
                            .cornerRadius(2)
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let hours = value.as(Double.self) {
                                Text("\(hours, specifier: "%.0f")h")
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
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - History Section

    private static let historyPreviewCount = 5

    private var historySection: some View {
        Section(L10n.history) {
            ForEach(entries.prefix(Self.historyPreviewCount)) { entry in
                SleepEntryRow(entry: entry) {
                    editingEntry = entry
                } onDelete: {
                    Task { await deleteEntry(entry) }
                }
            }
            if entries.count > Self.historyPreviewCount {
                NavigationLink {
                    SleepHistoryView()
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
        entries = sleepRepository.entries()
        if showSpinner { isLoading = entries.isEmpty }

        try? await sleepRepository.refresh()
        entries = sleepRepository.entries()

        isLoading = false

        if UserDefaults.standard.bool(forKey: HealthKitService.readSleepEnabledKey) {
            await importFromHealthKit()
        }
    }

    /// Import nights from Apple Health that the app doesn't have yet
    /// (read-only — never writes back to Health from here).
    private func importFromHealthKit() async {
        let healthKit = HealthKitService.shared
        guard healthKit.isAvailable else { return }
        let since = Date().adding(days: -90)
        guard let samples = try? await healthKit.fetchSleepSamples(since: since), !samples.isEmpty else { return }

        let existingDates = Set(entries.map(\.entryDate))
        var imported = false
        for night in HealthKitService.nights(from: samples) where !existingDates.contains(night.entryDate) {
            let create = SleepCreate(
                durationMinutes: night.asleepMinutes,
                quality: Self.importedQuality,
                entryDate: night.entryDate,
                bedtime: DateFormatting.isoDateTimeString(from: night.bedtime),
                wakeTime: DateFormatting.isoDateTimeString(from: night.wakeTime),
                wakeUps: night.wakeUps,
                notes: nil
            )
            if await (try? sleepRepository.createEntry(create)) != nil {
                imported = true
            }
        }

        if imported {
            entries = sleepRepository.entries()
        }
    }

    private func deleteEntry(_ entry: SleepEntry) async {
        do {
            try await sleepRepository.deleteEntry(id: entry.id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }
        entries = sleepRepository.entries()
    }
}

// MARK: - Entry Row

/// One history row — shared by the preview list on the sleep page and the
/// full history subpage.
struct SleepEntryRow: View {
    let entry: SleepEntry
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
                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatSleepDuration(entry.durationMinutes))
                        .foregroundStyle(.secondary)
                    Text("\(entry.quality)/10")
                        .font(.caption)
                        .foregroundStyle(.purple)
                }
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

/// All sleep entries, loaded page-wise from the local store as the list
/// scrolls — List rows are lazy, so reaching the last loaded row triggers
/// the next page fetch.
struct SleepHistoryView: View {
    @Environment(SleepRepository.self) private var sleepRepository

    @State private var entries: [SleepEntry] = []
    @State private var hasMore = true
    @State private var editingEntry: SleepEntry?
    @State private var errorMessage: String?

    private static let pageSize = 50

    var body: some View {
        List {
            ForEach(entries) { entry in
                SleepEntryRow(entry: entry) {
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
            AddSleepSheet(existingEntry: entry) {
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
        let page = sleepRepository.entries(offset: entries.count, limit: Self.pageSize)
        entries += page
        hasMore = page.count == Self.pageSize
    }

    /// Re-reads everything loaded so far in one fetch — an edit can change an
    /// entry's date and therefore its position in the ordering.
    private func reloadLoadedWindow() {
        let limit = max(entries.count, Self.pageSize)
        entries = sleepRepository.entries(offset: 0, limit: limit)
        hasMore = entries.count == limit
    }

    private func deleteEntry(_ entry: SleepEntry) async {
        do {
            try await sleepRepository.deleteEntry(id: entry.id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            entries.removeAll { $0.id == entry.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Add / Edit Sleep Sheet

struct AddSleepSheet: View {
    @Environment(SleepRepository.self) private var sleepRepository
    @Environment(\.dismiss) private var dismiss

    let existingEntry: SleepEntry?
    let onSaved: () -> Void

    @State private var hoursText = "7"
    @State private var minutesText = "30"
    @State private var quality = 7.0
    @State private var date = Date()
    @State private var timesEnabled = false
    @State private var bedtimeTime = Calendar.current.date(
        bySettingHour: 23, minute: 0, second: 0, of: Date()
    ) ?? Date()
    @State private var wakeTimeTime = Calendar.current.date(
        bySettingHour: 7, minute: 0, second: 0, of: Date()
    ) ?? Date()
    @State private var wakeUpsText = ""
    @State private var notes = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(existingEntry: SleepEntry? = nil, onSaved: @escaping () -> Void) {
        self.existingEntry = existingEntry
        self.onSaved = onSaved
    }

    private var durationMinutes: Int {
        (Int(hoursText) ?? 0) * 60 + (Int(minutesText) ?? 0)
    }

    private var isValid: Bool {
        durationMinutes > 0 && durationMinutes <= 1440
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.sleepDuration) {
                    HStack {
                        TextField("7", text: $hoursText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                        Text(L10n.hours)
                            .foregroundStyle(.secondary)
                        TextField("30", text: $minutesText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                        Text(L10n.minutes)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    HStack {
                        Text(L10n.sleepQuality)
                        Spacer()
                        Text("\(Int(quality))/10")
                            .fontWeight(.semibold)
                            .foregroundStyle(.purple)
                    }
                    HStack(spacing: 8) {
                        Text(L10n.sleepQualityPoor)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Slider(value: $quality, in: 1 ... 10, step: 1)
                        Text(L10n.sleepQualityGreat)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    DatePicker(L10n.today, selection: $date, displayedComponents: .date)
                }

                Section {
                    Toggle(L10n.bedAndWakeTimes, isOn: $timesEnabled)
                    if timesEnabled {
                        DatePicker(L10n.bedtime, selection: $bedtimeTime, displayedComponents: .hourAndMinute)
                        DatePicker(L10n.wakeTime, selection: $wakeTimeTime, displayedComponents: .hourAndMinute)
                    }
                }

                Section {
                    HStack {
                        Text(L10n.wakeUps)
                        Spacer()
                        TextField("0", text: $wakeUpsText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                    }
                    TextField(L10n.notes, text: $notes)
                }
            }
            .navigationTitle(existingEntry != nil ? L10n.edit : L10n.logSleep)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(!isValid || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { prefill() }
            .onChange(of: timesEnabled) { _, enabled in
                if enabled { syncDurationFromTimes() }
            }
            .onChange(of: bedtimeTime) { _, _ in
                if timesEnabled { syncDurationFromTimes() }
            }
            .onChange(of: wakeTimeTime) { _, _ in
                if timesEnabled { syncDurationFromTimes() }
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
    }

    // MARK: - Time helpers

    /// Absolute bed/wake timestamps anchored on the entry date (the wake day);
    /// a bedtime at or after the wake time-of-day belongs to the prior evening.
    private func resolvedTimes() -> (bedtime: Date, wakeTime: Date)? {
        guard timesEnabled else { return nil }
        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: date)
        let bedComponents = calendar.dateComponents([.hour, .minute], from: bedtimeTime)
        let wakeComponents = calendar.dateComponents([.hour, .minute], from: wakeTimeTime)
        guard let wake = calendar.date(byAdding: wakeComponents, to: dayStart),
              var bed = calendar.date(byAdding: bedComponents, to: dayStart)
        else { return nil }
        if bed >= wake {
            bed = bed.adding(days: -1)
        }
        return (bed, wake)
    }

    private func syncDurationFromTimes() {
        guard let (bed, wake) = resolvedTimes() else { return }
        let minutes = Int(wake.timeIntervalSince(bed) / 60)
        hoursText = "\(minutes / 60)"
        minutesText = "\(minutes % 60)"
    }

    // MARK: - Health write-back

    /// Best effort, create-only and gated on the independent write toggle —
    /// duration-only entries are skipped because Health needs a real interval.
    private func writeToHealthIfEnabled(bedtime: Date?, wakeTime: Date?) async {
        guard UserDefaults.standard.bool(forKey: HealthKitService.writeSleepEnabledKey),
              HealthKitService.shared.isAvailable,
              let bedtime, let wakeTime
        else { return }
        try? await HealthKitService.shared.saveSleep(bedtime: bedtime, wakeTime: wakeTime)
    }

    // MARK: - Prefill / Save

    private func prefill() {
        guard let entry = existingEntry else { return }
        hoursText = "\(entry.durationMinutes / 60)"
        minutesText = "\(entry.durationMinutes % 60)"
        quality = Double(entry.quality)
        if let d = DateFormatting.date(from: entry.entryDate) {
            date = d
        }
        if let bedtimeString = entry.bedtime, let bed = DateFormatting.isoDateTime(from: bedtimeString),
           let wakeString = entry.wakeTime, let wake = DateFormatting.isoDateTime(from: wakeString)
        {
            timesEnabled = true
            bedtimeTime = bed
            wakeTimeTime = wake
        }
        if let wakeUps = entry.wakeUps {
            wakeUpsText = "\(wakeUps)"
        }
        notes = entry.notes ?? ""
    }

    private func save() async {
        guard isValid else { return }
        isSaving = true
        let dateStr = DateFormatting.isoString(from: date)
        let times = resolvedTimes()
        let bedtimeIso = times.map { DateFormatting.isoDateTimeString(from: $0.bedtime) }
        let wakeTimeIso = times.map { DateFormatting.isoDateTimeString(from: $0.wakeTime) }
        let wakeUps = wakeUpsText.isEmpty ? nil : Int(wakeUpsText)

        do {
            if let existing = existingEntry {
                let update = SleepUpdate(
                    durationMinutes: durationMinutes,
                    quality: Int(quality),
                    entryDate: dateStr,
                    bedtime: bedtimeIso,
                    wakeTime: wakeTimeIso,
                    wakeUps: wakeUps,
                    notes: notes.isEmpty ? nil : notes
                )
                try await sleepRepository.updateEntry(id: existing.id, update)
            } else {
                let create = SleepCreate(
                    durationMinutes: durationMinutes,
                    quality: Int(quality),
                    entryDate: dateStr,
                    bedtime: bedtimeIso,
                    wakeTime: wakeTimeIso,
                    wakeUps: wakeUps,
                    notes: notes.isEmpty ? nil : notes
                )
                try await sleepRepository.createEntry(create)
                await writeToHealthIfEnabled(bedtime: times?.bedtime, wakeTime: times?.wakeTime)
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
