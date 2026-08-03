import SwiftUI

struct FoodSearchView: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    var date: String?

    @State private var query = ""
    @State private var searchResults: [Food] = []
    @State private var recentFoods: [Food] = []
    @State private var favoriteFoods: [Food] = []
    @State private var selectedTab = 0
    @State private var isSearching = false
    @State private var selectedFood: Food?
    @State private var editingFood: Food?
    @State private var showLogSheet = false
    @State private var showCreateFood = false
    @State private var showCreateRecipe = false
    @State private var searchTask: Task<Void, Never>?
    @State private var errorMessage: String?
    @State private var toastMessage: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $selectedTab.animation(reduceMotion ? nil : .default)) {
                Text(L10n.search).tag(0)
                Text(L10n.recent).tag(1)
                Text(L10n.favorites).tag(2)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            TabView(selection: $selectedTab) {
                searchTab
                    .tag(0)
                recentTab
                    .tag(1)
                favoritesTab
                    .tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
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
                // A single + presents a menu: foods and recipes are both
                // created from here, so the Settings "quick actions" duplicates
                // are gone and the Foods tab is the one place to add either.
                Menu {
                    Button {
                        showCreateFood = true
                    } label: {
                        Label(L10n.createFood, systemImage: "fork.knife")
                    }
                    Button {
                        showCreateRecipe = true
                    } label: {
                        Label(L10n.createRecipe, systemImage: "book")
                    }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(L10n.create)
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
        .toast(message: $toastMessage)
        .sheet(item: $selectedFood, onDismiss: {
            // The search field's keyboard survives the sheet's presentation and
            // pops back up over the results when it closes — drop first
            // responder so the list (and the field itself) stays readable.
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder),
                to: nil,
                from: nil,
                for: nil
            )
        }) { food in
            LogFoodSheet(food: food, date: date ?? DateFormatting.today)
        }
        .sheet(item: $editingFood) { food in
            FoodEditSheet(food: food) { updated in
                foodUpdated(updated)
            }
        }
        .sheet(isPresented: $showCreateFood) {
            FoodEditSheet { _ in
                Task { await loadRecent() }
            }
        }
        .sheet(isPresented: $showCreateRecipe) {
            RecipeEditSheet()
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
                ContentUnavailableView(
                    L10n.noResults,
                    systemImage: "magnifyingglass",
                    description: Text("\(L10n.noResults): \"\(query)\"")
                )
            } else {
                List(searchResults) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
            }
        }
    }

    /// The shared search field filters the Recent/Favorites lists too — typing
    /// here narrows whichever tab is showing, not just the Search tab.
    private func matches(_ food: Food) -> Bool {
        query.isEmpty
            || food.name.localizedCaseInsensitiveContains(query)
            || (food.brand?.localizedCaseInsensitiveContains(query) ?? false)
    }

    private var recentTab: some View {
        let items = recentFoods.filter { matches($0) }
        return Group {
            if items.isEmpty {
                if query.isEmpty {
                    ContentUnavailableView(L10n.recent, systemImage: "clock", description: Text(L10n.noRecentFoods))
                } else {
                    ContentUnavailableView(
                        L10n.noResults,
                        systemImage: "magnifyingglass",
                        description: Text("\(L10n.noResults): \"\(query)\"")
                    )
                }
            } else {
                List(items) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
            }
        }
    }

    private var favoritesTab: some View {
        let items = favoriteFoods.filter { matches($0) }
        return Group {
            if items.isEmpty {
                if query.isEmpty {
                    ContentUnavailableView(
                        L10n.favorites,
                        systemImage: "star",
                        description: Text(L10n.markFavoritesHint)
                    )
                } else {
                    ContentUnavailableView(
                        L10n.noResults,
                        systemImage: "magnifyingglass",
                        description: Text("\(L10n.noResults): \"\(query)\"")
                    )
                }
            } else {
                List(items) { food in
                    foodRow(food)
                }
                .listStyle(.plain)
            }
        }
    }

    private func foodRow(_ food: Food) -> some View {
        Button {
            selectedFood = food
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
                            .foregroundStyle(Color.accentColor)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        // A bare long-press used to jump straight into editing, which gave no
        // hint that tap and long-press did different things. A context menu
        // names both actions instead, leaving tap as the fast path to logging.
        .contextMenu {
            Button {
                selectedFood = food
            } label: {
                Label(L10n.logFood, systemImage: "plus.circle")
            }
            Button {
                editingFood = food
            } label: {
                Label(L10n.editFood, systemImage: "pencil")
            }
            Button {
                Task { await toggleFavorite(food) }
            } label: {
                Label(
                    food.isFavorite ? L10n.removeFromFavorites : L10n.addToFavorites,
                    systemImage: food.isFavorite ? "star.slash" : "star"
                )
            }
        }
    }

    private func toggleFavorite(_ food: Food) async {
        do {
            let updated = try await foodRepository.toggleFavorite(foodId: food.id, isFavorite: !food.isFavorite)
            foodUpdated(updated)
            await loadFavorites()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Reflects an edit back into whichever list(s) currently show this food.
    private func foodUpdated(_ updated: Food) {
        for index in searchResults.indices where searchResults[index].id == updated.id {
            searchResults[index] = updated
        }
        for index in recentFoods.indices where recentFoods[index].id == updated.id {
            recentFoods[index] = updated
        }
        for index in favoriteFoods.indices where favoriteFoods[index].id == updated.id {
            favoriteFoods[index] = updated
        }
    }

    private func search(_ query: String) async {
        guard query.count >= 2 else {
            searchResults = []
            return
        }
        isSearching = true
        searchResults = await foodRepository.searchFoods(query: query)
        isSearching = false
    }

    private func loadRecent() async {
        recentFoods = foodRepository.localRecentFoods()
        recentFoods = await foodRepository.refreshRecentFoods()
    }

    private func loadFavorites() async {
        favoriteFoods = foodRepository.favorites()
        do {
            try await foodRepository.refreshFavorites()
            favoriteFoods = foodRepository.favorites()
        } catch {
            if favoriteFoods.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func mealForCurrentTime() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5 ..< 11: return "Breakfast"
        case 11 ..< 14: return "Lunch"
        case 14 ..< 17: return "Snacks"
        default: return "Dinner"
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
            try await entryRepository.createEntry(entry, food: food)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = "\(food.name) \(L10n.logged)"
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToLog
        }
    }
}

struct LogFoodSheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    let food: Food
    /// Fired after a successful log, once this sheet has dismissed itself —
    /// lets a presenting flow (e.g. the barcode scanner) collapse its own
    /// sheet stack instead of leaving the user on an intermediate screen.
    var onLogged: (() -> Void)?

    @State private var logDate: Date
    @State private var servings: Double = 1.0
    @State private var mealType = "Lunch"
    @State private var eatenTime = Date()
    @State private var isLogging = false
    @State private var errorMessage: String?

    init(food: Food, date: String, onLogged: (() -> Void)? = nil) {
        self.food = food
        self.onLogged = onLogged
        _logDate = State(initialValue: DateFormatting.date(from: date) ?? Date())
    }

    /// "2 × 100 g = 200 g" — without the total there is no way to tell what a
    /// multiplier actually amounts to.
    private var servingSizeText: String {
        let count = MacroFormat.servings(servings)
        let unit = food.servingUnit.displayName
        let perServing = "\(MacroFormat.nutrient(food.servingSize)) \(unit)"
        let total = "\(MacroFormat.nutrient(food.servingSize * servings)) \(unit)"
        return "\(count) × \(perServing) = \(total)"
    }

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

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
                    ServingsField(servings: $servings)
                    HStack {
                        Text(L10n.servingSize)
                        Spacer()
                        Text(servingSizeText)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                }

                Section {
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.menu)
                    DatePicker(L10n.date, selection: $logDate, displayedComponents: .date)
                    DatePicker(L10n.time, selection: $eatenTime, displayedComponents: .hourAndMinute)
                }

                Section(L10n.nutrition) {
                    NutrientRow(label: L10n.calories, value: food.calories * servings, unit: "kcal")
                    NutrientRow(label: L10n.protein, value: food.protein * servings, unit: "g")
                    NutrientRow(label: L10n.carbs, value: food.carbs * servings, unit: "g")
                    NutrientRow(label: L10n.fat, value: food.fat * servings, unit: "g")
                    NutrientRow(label: L10n.fiber, value: food.fiber * servings, unit: "g")
                }

                NutrientSection(title: L10n.fatBreakdown, nutrients: scaled(food.fatBreakdownNutrients))
                NutrientSection(title: L10n.sugarsCarbs, nutrients: scaled(food.sugarCarbNutrients))
                NutrientSection(title: L10n.minerals, nutrients: scaled(food.mineralNutrients))
                NutrientSection(title: L10n.vitamins, nutrients: scaled(food.vitaminNutrients))
                NutrientSection(title: L10n.other, nutrients: scaled(food.otherNutrients))
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

    private func logFood() async {
        isLogging = true
        let entry = EntryCreate(
            foodId: food.id,
            mealType: mealType,
            servings: servings,
            date: logDate.isoDateString,
            eatenAt: eatenAtString()
        )
        do {
            try await entryRepository.createEntry(entry, food: food)
            dismiss()
            onLogged?()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLogging = false
    }

    /// Extended nutrients scaled to the picked serving count, matching the
    /// per-serving macro rows above.
    private func scaled(_ nutrients: [(String, Double, String)]) -> [(String, Double, String)] {
        nutrients.map { ($0.0, $0.1 * servings, $0.2) }
    }

    /// The picked time-of-day on the picked log date, as the UTC ISO-8601
    /// `eatenAt` wire value. `nil` (log time falls back to `createdAt`) only if
    /// the components can't be combined.
    private func eatenAtString() -> String? {
        let time = Calendar.current.dateComponents([.hour, .minute], from: eatenTime)
        guard let combined = Calendar.current.date(
            bySettingHour: time.hour ?? 0,
            minute: time.minute ?? 0,
            second: 0,
            of: logDate
        ) else { return nil }
        return DateFormatting.isoDateTimeString(from: combined)
    }
}
