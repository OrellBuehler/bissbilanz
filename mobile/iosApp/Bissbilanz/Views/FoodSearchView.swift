import SwiftUI

struct FoodSearchView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    var date: String?

    @State private var query = ""
    @State private var searchResults: [Food] = []
    @State private var recentFoods: [Food] = []
    @State private var favoriteFoods: [Food] = []
    @State private var selectedTab = 0
    @State private var isSearching = false
    @State private var selectedFood: Food?
    @State private var showLogSheet = false
    @State private var showCreateFood = false
    @State private var searchTask: Task<Void, Never>?
    @State private var errorMessage: String?
    @State private var toastMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $selectedTab) {
                Text(L10n.search).tag(0)
                Text(L10n.recent).tag(1)
                Text(L10n.favorites).tag(2)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            switch selectedTab {
            case 0:
                searchTab
            case 1:
                recentTab
            case 2:
                favoritesTab
            default:
                EmptyView()
            }
        }
        .navigationTitle(L10n.foods)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                if date != nil {
                    Button(L10n.close) { dismiss() }
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateFood = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .searchable(text: $query, prompt: L10n.searchFoods)
        .onChange(of: query) { _, newValue in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
                await search(newValue)
            }
        }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
        .overlay(alignment: .bottom) {
            if let message = toastMessage {
                Text(message)
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .sheet(item: $selectedFood) { food in
            LogFoodSheet(food: food, date: date ?? DateFormatting.today)
        }
        .sheet(isPresented: $showCreateFood) {
            FoodEditSheet { _ in
                Task { await loadRecent() }
            }
        }
        .task {
            await loadRecent()
            await loadFavorites()
        }
    }

    private var searchTab: some View {
        Group {
            if query.count < 2 {
                ContentUnavailableView(L10n.search, systemImage: "magnifyingglass", description: Text(L10n.searchFoods))
            } else if isSearching {
                LoadingView(message: L10n.loading)
            } else if searchResults.isEmpty {
                ContentUnavailableView(L10n.noResults, systemImage: "magnifyingglass", description: Text("\(L10n.noResults): \"\(query)\""))
            } else {
                List(searchResults) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
                .navigationDestination(for: Food.self) { food in
                    FoodDetailView(foodId: food.id)
                }
            }
        }
    }

    private var recentTab: some View {
        Group {
            if recentFoods.isEmpty {
                ContentUnavailableView(L10n.recent, systemImage: "clock", description: Text(L10n.noRecentFoods))
            } else {
                List(recentFoods) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
                .navigationDestination(for: Food.self) { food in
                    FoodDetailView(foodId: food.id)
                }
            }
        }
    }

    private var favoritesTab: some View {
        Group {
            if favoriteFoods.isEmpty {
                ContentUnavailableView(L10n.favorites, systemImage: "star", description: Text(L10n.noRecentFoods))
            } else {
                List(favoriteFoods) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
                .navigationDestination(for: Food.self) { food in
                    FoodDetailView(foodId: food.id)
                }
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
                if date != nil {
                    Button {
                        Task { await quickLogFood(food) }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.accentColor)
                    }
                    .buttonStyle(.plain)
                }
                NavigationLink(value: food) {
                    EmptyView()
                }
                .frame(width: 0)
                .opacity(0)
            }
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadFavorites() async {
        do {
            let response = try await api.getFavorites()
            favoriteFoods = response.foods
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func mealForCurrentTime() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<11: return "breakfast"
        case 11..<14: return "lunch"
        case 14..<17: return "snacks"
        default: return "dinner"
        }
    }

    private func quickLogFood(_ food: Food) async {
        guard let date else { return }
        let entry = EntryCreate(
            foodId: food.id,
            mealType: mealForCurrentTime(),
            servings: 1,
            date: date
        )
        do {
            _ = try await api.createEntry(entry)
            showToast("\(food.name) logged")
        } catch {
            showToast("Failed to log")
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

struct LogFoodSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let food: Food
    let date: String

    @State private var servings: Double = 1.0
    @State private var mealType = "lunch"
    @State private var isLogging = false
    @State private var errorMessage: String?

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

                Section(L10n.servings) {
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

                Section(L10n.meal) {
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section(L10n.nutrition) {
                    NutrientRow(label: L10n.calories, value: food.calories * servings, unit: "kcal", color: MacroColors.calories)
                    NutrientRow(label: L10n.protein, value: food.protein * servings, unit: "g", color: MacroColors.protein)
                    NutrientRow(label: L10n.carbs, value: food.carbs * servings, unit: "g", color: MacroColors.carbs)
                    NutrientRow(label: L10n.fat, value: food.fat * servings, unit: "g", color: MacroColors.fat)
                    NutrientRow(label: L10n.fiber, value: food.fiber * servings, unit: "g", color: MacroColors.fiber)
                }
            }
            .navigationTitle(L10n.logFood)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.log) {
                        Task { await logFood() }
                    }
                    .disabled(isLogging)
                    .fontWeight(.semibold)
                }
            }
            .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
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
        } catch {
            errorMessage = error.localizedDescription
        }
        isLogging = false
    }
}
