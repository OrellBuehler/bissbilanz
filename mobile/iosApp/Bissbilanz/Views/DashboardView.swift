import SwiftUI

struct DashboardView: View {
    @Environment(BissbilanzAPI.self) private var api

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

    // Widget data
    @State private var supplementChecklist: [SupplementChecklist] = []
    @State private var latestWeight: WeightEntry?

    private var dateString: String { selectedDate.isoDateString }

    private var totalCalories: Double { entries.reduce(0) { $0 + $1.totalCalories } }
    private var totalProtein: Double { entries.reduce(0) { $0 + $1.totalProtein } }
    private var totalCarbs: Double { entries.reduce(0) { $0 + $1.totalCarbs } }
    private var totalFat: Double { entries.reduce(0) { $0 + $1.totalFat } }
    private var totalFiber: Double { entries.reduce(0) { $0 + $1.totalFiber } }

    private var mealGroups: [(String, [Entry])] {
        let grouped = Dictionary(grouping: entries, by: \.mealType)
        let order = ["breakfast", "lunch", "dinner", "snacks"]
        return order.compactMap { meal in
            guard let items = grouped[meal], !items.isEmpty else { return nil }
            return (meal, items)
        } + grouped.filter { !order.contains($0.key) }.sorted(by: { $0.key < $1.key }).map { ($0.key, $0.value) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    dateNavigator
                    macroRings

                    if isFastingDay {
                        fastingBanner
                    }

                    if preferences.showWeightWidget, let weight = latestWeight {
                        weightWidget(weight)
                    }

                    if preferences.showSupplementsWidget && !supplementChecklist.isEmpty {
                        supplementsWidget
                    }

                    if mealGroups.isEmpty && !isLoading {
                        emptyState
                    } else {
                        ForEach(mealGroups, id: \.0) { meal, mealEntries in
                            NavigationLink(value: dateString) {
                                MealCard(mealType: meal, entries: mealEntries) {}
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding()
            }
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
            }
            .sheet(isPresented: $showScanner) {
                NavigationStack {
                    BarcodeScannerView()
                }
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
        }
    }

    // MARK: - Date Navigator

    private var dateNavigator: some View {
        HStack {
            Button {
                selectedDate = selectedDate.adding(days: -1)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
                        selectedDate = Date()
                    }
                    .font(.caption)
                }
            }

            Spacer()

            Button {
                selectedDate = selectedDate.adding(days: 1)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
            MacroRingView(label: "Cal", current: totalCalories, goal: goals.calorieGoal, color: MacroColors.calories, showGoal: true)
            MacroRingView(label: "P", current: totalProtein, goal: goals.proteinGoal, color: MacroColors.protein, showGoal: true)
            MacroRingView(label: "C", current: totalCarbs, goal: goals.carbGoal, color: MacroColors.carbs, showGoal: true)
            MacroRingView(label: "F", current: totalFat, goal: goals.fatGoal, color: MacroColors.fat, showGoal: true)
            MacroRingView(label: "Fb", current: totalFiber, goal: goals.fiberGoal, color: MacroColors.fiber, showGoal: true)
        }
    }

    // MARK: - Fasting Day Banner

    private var fastingBanner: some View {
        HStack {
            Image(systemName: "leaf")
                .foregroundStyle(.orange)
            Text(L10n.fastingDay)
                .font(.subheadline)
                .fontWeight(.medium)
            Spacer()
            Button {
                Task { await toggleFastingDay() }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.orange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
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
               let date = DateFormatting.date(from: String(dateStr.prefix(10))) {
                Text(DateFormatting.displayString(from: date))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
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
                let taken = supplementChecklist.filter(\.taken).count
                Text("\(taken)/\(supplementChecklist.count)")
                    .font(.caption)
                    .foregroundStyle(taken == supplementChecklist.count ? .green : .secondary)
            }

            ForEach(supplementChecklist) { item in
                Button {
                    Task { await toggleSupplement(item) }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: item.taken ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.taken ? .green : .secondary)
                        Text(item.supplement.name)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .strikethrough(item.taken)
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "fork.knife.circle")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text(L10n.noEntriesYet)
                .foregroundStyle(.secondary)
            Text(L10n.tapToAdd)
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                if !selectedDate.isToday {
                    Button(L10n.copyYesterday) {
                        showCopyConfirmation = true
                    }
                    .buttonStyle(.bordered)
                }

                Button {
                    Task { await toggleFastingDay() }
                } label: {
                    Label(L10n.fastingDayToggle, systemImage: isFastingDay ? "leaf.fill" : "leaf")
                }
                .buttonStyle(.bordered)
                .tint(.orange)
            }
            .padding(.top, 8)
        }
        .padding(.vertical, 48)
    }

    // MARK: - FAB

    private var fab: some View {
        VStack(spacing: 12) {
            Button {
                showScanner = true
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } label: {
                Image(systemName: "barcode.viewfinder")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial)
                    .clipShape(Circle())
            }

            Button {
                showQuickEntry = true
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                Image(systemName: "bolt")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial)
                    .clipShape(Circle())
            }

            Button {
                showFoodSearch = true
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } label: {
                Image(systemName: "plus")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(MacroColors.calories)
                    .clipShape(Circle())
                    .shadow(radius: 4)
            }
        }
        .padding()
    }

    // MARK: - Data Loading

    private func loadData() async {
        isLoading = true
        defer { isLoading = false }

        async let entriesTask = api.getEntries(date: dateString)
        async let goalsTask = api.getGoals()
        async let prefsTask = api.getPreferences()
        async let dayPropsTask = api.getDayProperties(date: dateString)
        async let supplementsTask = api.getSupplementChecklist(date: dateString)
        async let weightTask = api.getLatestWeight()

        do { entries = try await entriesTask } catch { entries = [] }
        do { goals = try await goalsTask ?? .defaults } catch { goals = .defaults }
        do { preferences = try await prefsTask } catch { preferences = .defaults }
        do { isFastingDay = try await dayPropsTask?.isFastingDay ?? false } catch { isFastingDay = false }
        do { supplementChecklist = try await supplementsTask } catch { supplementChecklist = [] }
        do { latestWeight = try await weightTask } catch { latestWeight = nil }
    }

    private func copyYesterday() async {
        let yesterday = selectedDate.adding(days: -1).isoDateString
        do {
            let copied = try await api.copyEntries(fromDate: yesterday, toDate: dateString)
            entries.append(contentsOf: copied)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = L10n.entriesCopied(copied.count)
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToCopy
        }
    }

    private func toggleFastingDay() async {
        let newValue = !isFastingDay
        do {
            if newValue {
                _ = try await api.setDayProperties(date: dateString, isFastingDay: true)
            } else {
                try await api.deleteDayProperties(date: dateString)
            }
            isFastingDay = newValue
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            toastMessage = L10n.error
        }
    }

    private func toggleSupplement(_ item: SupplementChecklist) async {
        do {
            if item.taken {
                try await api.unlogSupplement(id: item.supplement.id, date: dateString)
            } else {
                _ = try await api.logSupplement(id: item.supplement.id, date: dateString)
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            supplementChecklist = (try? await api.getSupplementChecklist(date: dateString)) ?? supplementChecklist
        } catch {
            toastMessage = L10n.error
        }
    }
}
