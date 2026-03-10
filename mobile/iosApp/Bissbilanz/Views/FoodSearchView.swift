import SwiftUI

struct FoodSearchView: View {
    @EnvironmentObject var api: BissbilanzAPI
    @Environment(\.dismiss) var dismiss

    var date: String?

    @State private var query = ""
    @State private var searchResults: [Food] = []
    @State private var recentFoods: [Food] = []
    @State private var selectedTab = 0
    @State private var isSearching = false
    @State private var selectedFood: Food?
    @State private var showLogSheet = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $selectedTab) {
                Text("Search").tag(0)
                Text("Recent").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            if selectedTab == 0 {
                searchTab
            } else {
                recentTab
            }
        }
        .navigationTitle("Foods")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                if date != nil {
                    Button("Close") { dismiss() }
                }
            }
        }
        .searchable(text: $query, prompt: "Search foods...")
        .onChange(of: query) { _, newValue in
            Task { await search(newValue) }
        }
        .sheet(item: $selectedFood) { food in
            LogFoodSheet(food: food, date: date ?? todayString())
        }
        .task {
            await loadRecent()
        }
    }

    private var searchTab: some View {
        Group {
            if query.count < 2 {
                ContentUnavailableView("Search for foods", systemImage: "magnifyingglass", description: Text("Type at least 2 characters"))
            } else if isSearching {
                LoadingView(message: "Searching...")
            } else if searchResults.isEmpty {
                ContentUnavailableView("No results", systemImage: "magnifyingglass", description: Text("No foods found for \"\(query)\""))
            } else {
                List(searchResults) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
            }
        }
    }

    private var recentTab: some View {
        Group {
            if recentFoods.isEmpty {
                ContentUnavailableView("No recent foods", systemImage: "clock", description: Text("Foods you log will appear here"))
            } else {
                List(recentFoods) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
            }
        }
    }

    private func foodRow(_ food: Food) -> some View {
        Button {
            if date != nil {
                selectedFood = food
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(food.name)
                        .font(.body)
                        .foregroundStyle(.primary)
                    HStack(spacing: 4) {
                        Text("\(Int(food.calories)) cal")
                            .foregroundStyle(MacroColors.calories)
                        Text("\u{00B7}")
                            .foregroundStyle(.secondary)
                        Text("P\(Int(food.protein))")
                            .foregroundStyle(MacroColors.protein)
                        Text("C\(Int(food.carbs))")
                            .foregroundStyle(MacroColors.carbs)
                        Text("F\(Int(food.fat))")
                            .foregroundStyle(MacroColors.fat)
                    }
                    .font(.caption)
                }
                Spacer()
                if let brand = food.brand {
                    Text(brand)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                if food.isFavorite {
                    Image(systemName: "star.fill")
                        .font(.caption)
                        .foregroundStyle(.yellow)
                }
                NavigationLink(value: food) {
                    EmptyView()
                }
                .frame(width: 0)
                .opacity(0)
            }
        }
        .navigationDestination(for: Food.self) { food in
            FoodDetailView(foodId: food.id)
        }
    }

    private func search(_ query: String) async {
        guard query.count >= 2 else {
            searchResults = []
            return
        }
        isSearching = true
        do {
            searchResults = try await api.searchFoods(query: query)
        } catch {
            searchResults = []
        }
        isSearching = false
    }

    private func loadRecent() async {
        do {
            recentFoods = try await api.getRecentFoods()
        } catch {}
    }

    private func todayString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}

struct LogFoodSheet: View {
    @EnvironmentObject var api: BissbilanzAPI
    @Environment(\.dismiss) var dismiss

    let food: Food
    let date: String

    @State private var servings: Double = 1.0
    @State private var mealType = "lunch"
    @State private var isLogging = false

    private let mealTypes = ["breakfast", "lunch", "dinner", "snacks"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text(food.name)
                            .font(.headline)
                        Spacer()
                        if let brand = food.brand {
                            Text(brand)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Servings") {
                    HStack {
                        Text("\(food.servingSize, specifier: "%.0f") \(food.servingUnit.displayName)")
                            .foregroundStyle(.secondary)
                        Spacer()
                        Stepper(value: $servings, in: 0.25...20, step: 0.25) {
                            Text("\(servings, specifier: "%.2g")x")
                                .fontWeight(.medium)
                        }
                    }
                }

                Section("Meal") {
                    Picker("Meal", selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(meal.capitalized).tag(meal)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Nutrition") {
                    NutrientRow(label: "Calories", value: food.calories * servings, unit: "kcal", color: MacroColors.calories)
                    NutrientRow(label: "Protein", value: food.protein * servings, unit: "g", color: MacroColors.protein)
                    NutrientRow(label: "Carbs", value: food.carbs * servings, unit: "g", color: MacroColors.carbs)
                    NutrientRow(label: "Fat", value: food.fat * servings, unit: "g", color: MacroColors.fat)
                    NutrientRow(label: "Fiber", value: food.fiber * servings, unit: "g", color: MacroColors.fiber)
                }
            }
            .navigationTitle("Log Food")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Log") {
                        Task { await logFood() }
                    }
                    .disabled(isLogging)
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private func logFood() async {
        isLogging = true
        let entry = EntryCreate(
            foodId: food.id,
            mealType: mealType,
            servings: servings,
            date: date
        )
        do {
            _ = try await api.createEntry(entry)
            dismiss()
        } catch {}
        isLogging = false
    }
}
