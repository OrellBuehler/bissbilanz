import SwiftUI

struct DashboardView: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(GoalsRepository.self) private var goalsRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Environment(SupplementRepository.self) private var supplementRepository
    @Environment(WeightRepository.self) private var weightRepository

    @State private var entries: [Entry] = []
    @State private var goals: Goals = .defaults
    @State private var preferences: Preferences = .defaults
    @State private var selectedDate = Date()
    @State private var isLoading = false
    @State private var showFoodSearch = false
    @State private var showScanner = false
    @State private var showQuickEntry = false
    @State private var showCopyConfirmation = false
    @State private var toastMessage: String?
    @State private var isFastingDay = false
    /// Edge the incoming day content is pushed in from when the date changes.
    @State private var slideEdge: Edge = .trailing
    /// The calendar day that was "today" at last activation, so we can roll the
    /// selected date forward after a midnight rollover while backgrounded.
    @State private var trackedToday = Calendar.current.startOfDay(for: Date())

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    // Widget data
    @State private var supplementChecklist: [SupplementChecklist] = []
    @State private var latestWeight: WeightEntry?

    private var dateString: String {
        selectedDate.isoDateString
    }

    private var totalCalories: Double {
        entries.reduce(0) { $0 + $1.totalCalories }
    }

    private var totalProtein: Double {
        entries.reduce(0) { $0 + $1.totalProtein }
    }

    private var totalCarbs: Double {
        entries.reduce(0) { $0 + $1.totalCarbs }
    }

    private var totalFat: Double {
        entries.reduce(0) { $0 + $1.totalFat }
    }

    private var totalFiber: Double {
        entries.reduce(0) { $0 + $1.totalFiber }
    }

    private var mealGroups: [(String, [Entry])] {
        MealGrouping.group(entries)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    dateNavigator

                    // ZStack so the outgoing and incoming day overlap during
                    // the push transition instead of stacking vertically.
                    ZStack {
                        dayContent
                            .id(dateString)
                            .transition(reduceMotion ? .identity : .push(from: slideEdge))
                    }
                }
                .padding()
            }
            .simultaneousGesture(dateSwipeGesture)
            .navigationTitle(L10n.appName)
            .navigationDestination(for: String.self) { date in
                DayLogView(date: date)
            }
            .refreshable { await loadData() }
            .toast(message: $toastMessage)
            .overlay(alignment: .bottomTrailing) { fab }
            .sheet(isPresented: $showFoodSearch) {
                NavigationStack {
                    FoodSearchView(date: dateString)
                }
                // Logging happens inside the sheet; reload on dismiss so the
                // new entries show without a manual pull-to-refresh.
                .onDisappear { Task { await loadData() } }
            }
            .sheet(isPresented: $showScanner) {
                NavigationStack {
                    BarcodeScannerView()
                }
                .onDisappear { Task { await loadData() } }
            }
            .sheet(isPresented: $showQuickEntry) {
                QuickEntrySheet(date: dateString) {
                    Task { await loadData() }
                }
            }
            .confirmationDialog(L10n.copyYesterday, isPresented: $showCopyConfirmation) {
                Button(L10n.copyYesterday) {
                    Task { await copyYesterday() }
                }
            } message: {
                Text(L10n.copyConfirmation(to: DateFormatting.displayString(from: selectedDate)))
            }
            .task { await loadData() }
            .onChange(of: selectedDate) { _, _ in
                Task { await loadData() }
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                let newToday = Calendar.current.startOfDay(for: Date())
                guard newToday != trackedToday else { return }
                // Day rolled over while backgrounded; if we were showing the old
                // "today", follow the rollover instead of staying stuck on it.
                if Calendar.current.isDate(selectedDate, inSameDayAs: trackedToday) {
                    selectedDate = Date()
                }
                trackedToday = newToday
            }
        }
    }

    // MARK: - Day Content

    /// Everything below the date navigator; swapped out with a directional
    /// push transition when the selected date changes.
    private var dayContent: some View {
        VStack(spacing: 16) {
            macroRings

            if totalCalories == 0 {
                HStack {
                    Image(systemName: "fork.knife")
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.fastingDay)
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Text(L10n.fastingDayDescription)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { isFastingDay },
                        set: { _ in Task { await toggleFastingDay() } }
                    ))
                    .labelsHidden()
                }
                .padding(12)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if preferences.showWeightWidget, let weight = latestWeight {
                NavigationLink {
                    WeightView()
                } label: {
                    weightWidget(weight)
                }
                .buttonStyle(.plain)
            }

            if preferences.showSupplementsWidget, !supplementChecklist.isEmpty {
                supplementsWidget
            }

            if mealGroups.isEmpty, !isLoading {
                emptyState
            } else {
                ForEach(mealGroups, id: \.0) { meal, mealEntries in
                    NavigationLink(value: dateString) {
                        MealCard(mealType: meal, entries: mealEntries)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Date Navigation

    /// Horizontal swipe anywhere on the dashboard changes the day. Runs
    /// simultaneously with the vertical scroll gesture; the dominance check in
    /// `onEnded` keeps scrolling and pull-to-refresh unaffected, and the
    /// minimum distance keeps taps intact.
    private var dateSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 20)
            .onEnded { value in
                let horizontal = value.translation.width
                let vertical = value.translation.height
                guard abs(horizontal) > 60, abs(horizontal) > abs(vertical) else { return }
                changeDay(by: horizontal < 0 ? 1 : -1)
            }
    }

    /// Moves the selected date by `delta` days with a directional push
    /// animation. Moving past today is blocked — no future dates.
    private func changeDay(by delta: Int) {
        guard delta != 0 else { return }
        if delta > 0, selectedDate.isToday { return }
        slideEdge = delta > 0 ? .trailing : .leading
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) {
            selectedDate = selectedDate.adding(days: delta)
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func goToToday() {
        slideEdge = .trailing
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) {
            selectedDate = Date()
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    // MARK: - Date Navigator

    private var dateNavigator: some View {
        HStack {
            Button {
                changeDay(by: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }

            Spacer()

            VStack(spacing: 2) {
                Text(selectedDate.isToday ? L10n.today : DateFormatting.displayString(from: selectedDate))
                    .font(.title3)
                    .fontWeight(.semibold)
                if !selectedDate.isToday {
                    Button(L10n.goToToday) {
                        goToToday()
                    }
                    .font(.caption)
                }
            }

            Spacer()

            Button {
                changeDay(by: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .disabled(selectedDate.isToday)
        }
        .padding(.horizontal)
    }

    // MARK: - Macro Rings

    private var macroRings: some View {
        HStack(spacing: 16) {
            MacroRingView(
                label: "Cal",
                current: totalCalories,
                goal: goals.calorieGoal,
                color: MacroColors.calories,
                showGoal: true
            )
            MacroRingView(
                label: "P",
                current: totalProtein,
                goal: goals.proteinGoal,
                color: MacroColors.protein,
                showGoal: true,
                animationDelay: 0.05
            )
            MacroRingView(
                label: "C",
                current: totalCarbs,
                goal: goals.carbGoal,
                color: MacroColors.carbs,
                showGoal: true,
                animationDelay: 0.1
            )
            MacroRingView(
                label: "F",
                current: totalFat,
                goal: goals.fatGoal,
                color: MacroColors.fat,
                showGoal: true,
                animationDelay: 0.15
            )
            MacroRingView(
                label: "Fb",
                current: totalFiber,
                goal: goals.fiberGoal,
                color: MacroColors.fiber,
                showGoal: true,
                animationDelay: 0.2
            )
        }
    }

    // MARK: - Weight Widget

    private func weightWidget(_ entry: WeightEntry) -> some View {
        HStack {
            Image(systemName: "scalemass")
                .foregroundStyle(.blue)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.weight)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(entry.weightKg, specifier: "%.1f") kg")
                    .font(.headline)
            }
            Spacer()
            if let dateStr = entry.loggedAt ?? entry.createdAt,
               let date = DateFormatting.date(from: String(dateStr.prefix(10)))
            {
                Text(DateFormatting.displayString(from: date))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Supplements Widget

    private var supplementsWidget: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "pills")
                    .foregroundStyle(.purple)
                Text(L10n.supplements)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Spacer()
                let taken = supplementChecklist.count(where: \.taken)
                Text("\(taken)/\(supplementChecklist.count)")
                    .font(.caption)
                    .foregroundStyle(taken == supplementChecklist.count ? .green : .secondary)
            }

            VStack(spacing: 0) {
                ForEach(supplementChecklist) { item in
                    Button {
                        Task { await toggleSupplement(item) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: item.taken ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(item.taken ? .green : .secondary)
                            Text(item.supplement.name)
                                .font(.subheadline)
                                .foregroundStyle(item.taken ? .secondary : .primary)
                            Spacer()
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(L10n.noEntriesYet, systemImage: "fork.knife.circle")
        } description: {
            Text(L10n.tapToAdd)
        } actions: {
            if !selectedDate.isToday {
                Button(L10n.copyYesterday) {
                    showCopyConfirmation = true
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 24)
    }

    // MARK: - FAB

    private var fab: some View {
        FloatingControlGroup {
            VStack(spacing: 12) {
                Button {
                    showScanner = true
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                } label: {
                    Image(systemName: "barcode.viewfinder")
                        .font(.title3)
                        .frame(width: 44, height: 44)
                }
                .circularGlassBackground()
                .accessibilityLabel(L10n.scanBarcode)

                Button {
                    showQuickEntry = true
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: "bolt")
                        .font(.title3)
                        .frame(width: 44, height: 44)
                }
                .circularGlassBackground()
                .accessibilityLabel(L10n.quickEntry)

                Button {
                    showFoodSearch = true
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                } label: {
                    Image(systemName: "plus")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                }
                .circularGlassBackground(tint: MacroColors.calories)
                .accessibilityLabel(L10n.addFood)
            }
            .padding()
        }
    }

    // MARK: - Data Loading

    /// Instant render from the local store; `loadData` refreshes from the API on top.
    private func loadFromStore() {
        entries = entryRepository.entries(date: dateString)
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults
        isFastingDay = entryRepository.isFastingDay(date: dateString)
        supplementChecklist = supplementRepository.localChecklist(date: dateString)
        latestWeight = weightRepository.latest()
    }

    private func loadData() async {
        loadFromStore()
        isLoading = true
        defer { isLoading = false }

        async let entriesTask: Void? = try? entryRepository.refresh(date: dateString)
        async let goalsTask: Void? = try? goalsRepository.refresh()
        async let prefsTask: Void? = try? preferencesRepository.refresh()
        async let dayPropsTask: Void? = try? entryRepository.refreshDayProperties(date: dateString)
        // Refresh the supplement list (definitions), not just the checklist
        // (taken-logs): `localChecklist` reads the cached list, so without this
        // the card stays empty — and hidden — until a live checklist call
        // succeeds, which is why it appeared only intermittently.
        async let suppListTask: Void? = try? supplementRepository.refresh()
        async let supplementsTask = try? supplementRepository.refreshChecklist(date: dateString)
        async let weightTask: Void? = try? weightRepository.refresh()
        // Report the device timezone so server-side analytics/MCP use the user's tz.
        async let tzTask: Void? = try? preferencesRepository.reportTimeZone(TimeZone.current.identifier)

        _ = await (entriesTask, goalsTask, prefsTask, dayPropsTask, suppListTask, weightTask, tzTask)
        let checklist = await supplementsTask

        loadFromStore()
        if let checklist { supplementChecklist = checklist }
    }

    private func copyYesterday() async {
        let yesterday = selectedDate.adding(days: -1).isoDateString
        do {
            let count = try await entryRepository.copyEntries(fromDate: yesterday, toDate: dateString)
            entries = entryRepository.entries(date: dateString)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = L10n.entriesCopied(count)
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToCopy
        }
    }

    private func toggleFastingDay() async {
        let newValue = !isFastingDay
        do {
            if newValue {
                try await entryRepository.setDayProperties(date: dateString, isFastingDay: true)
            } else {
                try await entryRepository.deleteDayProperties(date: dateString)
            }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            toastMessage = L10n.error
        }
        isFastingDay = entryRepository.isFastingDay(date: dateString)
    }

    private func toggleSupplement(_ item: SupplementChecklist) async {
        let nowTaken = !item.taken
        let previous = supplementChecklist
        // Optimistic UI: flip the checkmark immediately so it feels instant.
        // The repository write is local-first (SwiftData + a queued upload), so
        // there's no need to block on a network checklist refresh — that round
        // trip was the source of the visible lag. `loadData` reconciles with
        // the server on the next appear / pull-to-refresh.
        supplementChecklist = supplementChecklist.map { entry in
            guard entry.supplement.id == item.supplement.id else { return entry }
            return SupplementChecklist(
                supplement: entry.supplement,
                taken: nowTaken,
                takenAt: nowTaken ? DateFormatting.isoDateTimeString(from: Date()) : nil
            )
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        do {
            if nowTaken {
                try await supplementRepository.logSupplement(id: item.supplement.id, date: dateString)
            } else {
                try await supplementRepository.unlogSupplement(id: item.supplement.id, date: dateString)
            }
        } catch {
            supplementChecklist = previous
            toastMessage = L10n.error
        }
    }
}
