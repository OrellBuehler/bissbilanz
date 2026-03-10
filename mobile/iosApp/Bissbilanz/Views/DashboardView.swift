import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var api: BissbilanzAPI

    @State private var entries: [Entry] = []
    @State private var goals: Goals = .defaults
    @State private var selectedDate = Date()
    @State private var isLoading = false
    @State private var showFoodSearch = false
    @State private var showScanner = false

    private var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: selectedDate)
    }

    private var isToday: Bool {
        Calendar.current.isDateInToday(selectedDate)
    }

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
                            MealCard(mealType: meal, entries: mealEntries) {
                                // tap navigates to day log
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Bissbilanz")
            .refreshable { await loadData() }
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
            .task { await loadData() }
            .onChange(of: selectedDate) { _, _ in
                Task { await loadData() }
            }
        }
    }

    private var dateNavigator: some View {
        HStack {
            Button {
                selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? selectedDate
            } label: {
                Image(systemName: "chevron.left")
            }

            Spacer()

            VStack {
                Text(isToday ? "Today" : dateString)
                    .font(.title3)
                    .fontWeight(.semibold)
                if !isToday {
                    Button("Go to Today") {
                        selectedDate = Date()
                    }
                    .font(.caption)
                }
            }

            Spacer()

            Button {
                selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? selectedDate
            } label: {
                Image(systemName: "chevron.right")
            }
            .disabled(isToday)
        }
        .padding(.horizontal)
    }

    private var macroRings: some View {
        HStack(spacing: 16) {
            MacroRingView(label: "Cal", current: totalCalories, goal: goals.calorieGoal, color: MacroColors.calories, showGoal: true)
            MacroRingView(label: "Protein", current: totalProtein, goal: goals.proteinGoal, color: MacroColors.protein, showGoal: true)
            MacroRingView(label: "Carbs", current: totalCarbs, goal: goals.carbGoal, color: MacroColors.carbs, showGoal: true)
            MacroRingView(label: "Fat", current: totalFat, goal: goals.fatGoal, color: MacroColors.fat, showGoal: true)
            MacroRingView(label: "Fiber", current: totalFiber, goal: goals.fiberGoal, color: MacroColors.fiber, showGoal: true)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife.circle")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No entries yet today.")
                .foregroundStyle(.secondary)
            Text("Tap + to add food.")
                .foregroundStyle(.secondary)
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
}
