import SwiftUI

struct DashboardView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var entries: [Entry] = []
    @State private var goals: Goals = .defaults
    @State private var selectedDate = Date()
    @State private var isLoading = false
    @State private var showFoodSearch = false
    @State private var showScanner = false
    @State private var showQuickEntry = false
    @State private var showCopyConfirmation = false
    @State private var toastMessage: String?

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
            .overlay(alignment: .bottomTrailing) { fab }
            .overlay(alignment: .bottom) { toastOverlay }
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
                Text("Copy all entries from yesterday to \(selectedDate.isToday ? L10n.today.lowercased() : dateString)?")
            }
            .task { await loadData() }
            .onChange(of: selectedDate) { _, _ in
                Task { await loadData() }
            }
        }
    }

    private var dateNavigator: some View {
        HStack {
            Button {
                selectedDate = selectedDate.adding(days: -1)
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
            } label: {
                Image(systemName: "chevron.right")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .disabled(selectedDate.isToday)
        }
        .padding(.horizontal)
    }

    private var macroRings: some View {
        HStack(spacing: 16) {
            MacroRingView(label: "Cal", current: totalCalories, goal: goals.calorieGoal, color: MacroColors.calories, showGoal: true)
            MacroRingView(label: "P", current: totalProtein, goal: goals.proteinGoal, color: MacroColors.protein, showGoal: true)
            MacroRingView(label: "C", current: totalCarbs, goal: goals.carbGoal, color: MacroColors.carbs, showGoal: true)
            MacroRingView(label: "F", current: totalFat, goal: goals.fatGoal, color: MacroColors.fat, showGoal: true)
            MacroRingView(label: "Fb", current: totalFiber, goal: goals.fiberGoal, color: MacroColors.fiber, showGoal: true)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "fork.knife.circle")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text(L10n.noEntriesYet)
                .foregroundStyle(.secondary)
            Text(L10n.tapToAdd)
                .foregroundStyle(.secondary)

            if !selectedDate.isToday {
                Button(L10n.copyYesterday) {
                    showCopyConfirmation = true
                }
                .buttonStyle(.bordered)
                .padding(.top, 8)
            }
        }
        .padding(.vertical, 48)
    }

    private var fab: some View {
        VStack(spacing: 12) {
            Button {
                showScanner = true
            } label: {
                Image(systemName: "barcode.viewfinder")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial)
                    .clipShape(Circle())
            }

            Button {
                showQuickEntry = true
            } label: {
                Image(systemName: "bolt")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial)
                    .clipShape(Circle())
            }

            Button {
                showFoodSearch = true
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

    @ViewBuilder
    private var toastOverlay: some View {
        if let message = toastMessage {
            Text(message)
                .font(.subheadline)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .padding(.bottom, 80)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func loadData() async {
        isLoading = true
        defer { isLoading = false }

        async let entriesTask = api.getEntries(date: dateString)
        async let goalsTask = api.getGoals()

        do {
            entries = try await entriesTask
        } catch {
            entries = []
        }

        do {
            goals = try await goalsTask ?? .defaults
        } catch {
            goals = .defaults
        }
    }

    private func copyYesterday() async {
        let yesterday = selectedDate.adding(days: -1).isoDateString
        do {
            let copied = try await api.copyEntries(fromDate: yesterday, toDate: dateString)
            entries.append(contentsOf: copied)
            showToast("\(copied.count) entries copied")
        } catch {
            showToast("Failed to copy entries")
        }
    }

    private func showToast(_ message: String) {
        withAnimation { toastMessage = message }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation { toastMessage = nil }
        }
    }
}
