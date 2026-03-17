import SwiftUI

struct SettingsView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AuthManager.self) private var authManager

    @State private var goals: Goals = .defaults
    @State private var preferences: Preferences = .defaults
    @State private var mealTypes: [MealType] = []
    @State private var isEditingGoals = false
    @State private var showLogoutConfirmation = false
    @State private var showCreateFood = false
    @State private var showCreateRecipe = false
    @State private var newMealTypeName = ""
    @State private var errorMessage: String?
    @State private var healthKitService = HealthKitService()
    @State private var healthSyncEnabled: Bool = UserDefaults.standard.bool(forKey: "healthkit_sync_enabled")
    @AppStorage("selected_tabs") private var selectedTabsRaw: String = "foods,favorites,insights"

    private var selectedTabNames: String {
        selectedTabsRaw.split(separator: ",")
            .compactMap { NavigableTab(rawValue: String($0)) }
            .map(\.label)
            .joined(separator: ", ")
    }

    // Goal editing fields
    @State private var editCalories = ""
    @State private var editProtein = ""
    @State private var editCarbs = ""
    @State private var editFat = ""
    @State private var editFiber = ""

    var body: some View {
        NavigationStack {
            List {
                // Goals section
                Section(L10n.goals) {
                    goalRow(L10n.calories, value: goals.calorieGoal, unit: "kcal", color: MacroColors.calories)
                    goalRow(L10n.protein, value: goals.proteinGoal, unit: "g", color: MacroColors.protein)
                    goalRow(L10n.carbs, value: goals.carbGoal, unit: "g", color: MacroColors.carbs)
                    goalRow(L10n.fat, value: goals.fatGoal, unit: "g", color: MacroColors.fat)
                    goalRow(L10n.fiber, value: goals.fiberGoal, unit: "g", color: MacroColors.fiber)
                    Button(L10n.editGoals) {
                        editCalories = "\(Int(goals.calorieGoal))"
                        editProtein = "\(Int(goals.proteinGoal))"
                        editCarbs = "\(Int(goals.carbGoal))"
                        editFat = "\(Int(goals.fatGoal))"
                        editFiber = "\(Int(goals.fiberGoal))"
                        isEditingGoals = true
                    }
                }

                // Navigation Tabs
                Section(L10n.navigationTabs) {
                    NavigationLink {
                        TabSelectionView()
                    } label: {
                        HStack {
                            Label(L10n.selectTabs, systemImage: "rectangle.3.group")
                            Spacer()
                            Text("\(selectedTabNames)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }

                // Navigation section
                Section {
                    NavigationLink { WeightView() } label: {
                        Label(L10n.weight, systemImage: "scalemass")
                    }
                    NavigationLink { SupplementsView() } label: {
                        Label(L10n.supplements, systemImage: "pills")
                    }
                    NavigationLink { RecipeListView() } label: {
                        Label(L10n.recipes, systemImage: "book")
                    }
                    NavigationLink { CalendarView() } label: {
                        Label(L10n.calendar, systemImage: "calendar")
                    }
                    NavigationLink { MaintenanceView() } label: {
                        Label(L10n.maintenance, systemImage: "function")
                    }
                }

                // HealthKit section
                if healthKitService.isAvailable {
                    Section(L10n.healthKit) {
                        Toggle(L10n.healthKit, isOn: $healthSyncEnabled)
                            .onChange(of: healthSyncEnabled) { _, enabled in
                                UserDefaults.standard.set(enabled, forKey: "healthkit_sync_enabled")
                                if enabled {
                                    Task {
                                        _ = await healthKitService.requestAuthorization()
                                    }
                                }
                            }
                        if healthKitService.isAuthorized {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                Text(L10n.permissionsGranted)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else if healthSyncEnabled {
                            Button {
                                Task { _ = await healthKitService.requestAuthorization() }
                            } label: {
                                Label(L10n.grantPermissions, systemImage: "heart.circle")
                            }
                        }
                    }
                }

                // Quick actions
                Section(L10n.quickActions) {
                    HStack(spacing: 12) {
                        Button {
                            showCreateFood = true
                        } label: {
                            Label(L10n.foods, systemImage: "plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            showCreateRecipe = true
                        } label: {
                            Label(L10n.recipes, systemImage: "plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }

                // Language section
                Section(L10n.language) {
                    Picker(L10n.language, selection: Binding(
                        get: { L10n.currentLocale },
                        set: { L10n.currentLocale = $0 }
                    )) {
                        ForEach(AppLocale.allCases, id: \.self) { locale in
                            Text(locale.displayName).tag(locale)
                        }
                    }
                }

                // Custom meal types
                Section(L10n.customMealTypes) {
                    ForEach(mealTypes) { mealType in
                        Text(mealType.name)
                            .swipeActions {
                                Button(role: .destructive) {
                                    Task { await deleteMealType(mealType) }
                                } label: {
                                    Label(L10n.delete, systemImage: "trash")
                                }
                            }
                    }
                    HStack {
                        TextField(L10n.customMealTypes, text: $newMealTypeName)
                        Button(L10n.add) {
                            Task { await addMealType() }
                        }
                        .disabled(newMealTypeName.isEmpty)
                    }
                }

                // Dashboard widgets
                Section(L10n.dashboardWidgets) {
                    Toggle(L10n.caloriesTrend, isOn: widgetBinding(\.showChartWidget, key: "showChartWidget"))
                    Toggle(L10n.favorites, isOn: widgetBinding(\.showFavoritesWidget, key: "showFavoritesWidget"))
                    Toggle(L10n.supplements, isOn: widgetBinding(\.showSupplementsWidget, key: "showSupplementsWidget"))
                    Toggle(L10n.weight, isOn: widgetBinding(\.showWeightWidget, key: "showWeightWidget"))
                    Toggle(L10n.mealBreakdown, isOn: widgetBinding(\.showMealBreakdownWidget, key: "showMealBreakdownWidget"))
                    Toggle(L10n.topFoods, isOn: widgetBinding(\.showTopFoodsWidget, key: "showTopFoodsWidget"))
                }

                // Favorite logging behavior
                Section(L10n.favoriteLogging) {
                    Picker(L10n.favoriteLogging, selection: Binding(
                        get: { preferences.favoriteMealAssignmentMode },
                        set: { newValue in
                            Task {
                                var update = PreferencesUpdate()
                                update.favoriteMealAssignmentMode = newValue
                                if let updated = try? await api.updatePreferences(update) {
                                    preferences = updated
                                }
                            }
                        }
                    )) {
                        Text(L10n.autoAssignByTime).tag("time_based")
                        Text(L10n.alwaysAsk).tag("ask_meal")
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                // Visible nutrients
                Section(L10n.visibleNutrients) {
                    NavigationLink {
                        VisibleNutrientsView(preferences: $preferences)
                    } label: {
                        HStack {
                            Text(L10n.visibleNutrients)
                            Spacer()
                            Text("\(preferences.visibleNutrients.count)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Account
                Section(L10n.account) {
                    Button(role: .destructive) {
                        showLogoutConfirmation = true
                    } label: {
                        Label(L10n.signOut, systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                // About
                Section(L10n.about) {
                    HStack {
                        Text(L10n.version)
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(L10n.settings)
            .confirmationDialog(L10n.signOut + "?", isPresented: $showLogoutConfirmation) {
                Button(L10n.signOut, role: .destructive) {
                    authManager.logout()
                }
            } message: {
                Text(L10n.signOutConfirmation)
            }
            .sheet(isPresented: $isEditingGoals) {
                goalsEditor
            }
            .sheet(isPresented: $showCreateFood) {
                FoodEditSheet()
            }
            .sheet(isPresented: $showCreateRecipe) {
                RecipeEditSheet()
            }
            .task { await loadData() }
            .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
    }

    // MARK: - Widget Toggle Binding

    private func widgetBinding(_ keyPath: KeyPath<Preferences, Bool>, key: String) -> Binding<Bool> {
        Binding(
            get: { preferences[keyPath: keyPath] },
            set: { newValue in
                Task {
                    var update = PreferencesUpdate()
                    switch key {
                    case "showChartWidget": update.showChartWidget = newValue
                    case "showFavoritesWidget": update.showFavoritesWidget = newValue
                    case "showSupplementsWidget": update.showSupplementsWidget = newValue
                    case "showWeightWidget": update.showWeightWidget = newValue
                    case "showMealBreakdownWidget": update.showMealBreakdownWidget = newValue
                    case "showTopFoodsWidget": update.showTopFoodsWidget = newValue
                    default: break
                    }
                    if let updated = try? await api.updatePreferences(update) {
                        preferences = updated
                    }
                }
            }
        )
    }

    // MARK: - Goal Row

    private func goalRow(_ label: String, value: Double, unit: String, color: Color) -> some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
            Spacer()
            Text("\(Int(value)) \(unit)")
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Goals Editor Sheet

    private var goalsEditor: some View {
        NavigationStack {
            Form {
                Section(L10n.dailyGoals) {
                    goalField(L10n.calories + " (kcal)", text: $editCalories)
                    goalField(L10n.protein + " (g)", text: $editProtein)
                    goalField(L10n.carbs + " (g)", text: $editCarbs)
                    goalField(L10n.fat + " (g)", text: $editFat)
                    goalField(L10n.fiber + " (g)", text: $editFiber)
                }
            }
            .navigationTitle(L10n.editGoals)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { isEditingGoals = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await saveGoals() }
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private func goalField(_ label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("", text: text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
        }
    }

    // MARK: - Actions

    private func saveGoals() async {
        let newGoals = Goals(
            calorieGoal: Double(editCalories) ?? goals.calorieGoal,
            proteinGoal: Double(editProtein) ?? goals.proteinGoal,
            carbGoal: Double(editCarbs) ?? goals.carbGoal,
            fatGoal: Double(editFat) ?? goals.fatGoal,
            fiberGoal: Double(editFiber) ?? goals.fiberGoal,
            sodiumGoal: goals.sodiumGoal,
            sugarGoal: goals.sugarGoal
        )
        do {
            goals = try await api.setGoals(newGoals)
        } catch {
            errorMessage = error.localizedDescription
        }
        isEditingGoals = false
    }

    private func loadData() async {
        async let g = try? api.getGoals()
        async let p = try? api.getPreferences()
        async let m = try? api.getMealTypes()

        goals = await g ?? .defaults
        preferences = await p ?? .defaults
        mealTypes = await m ?? []
    }

    private func addMealType() async {
        let name = newMealTypeName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let mealType = try await api.createMealType(name: name)
            mealTypes.append(mealType)
            newMealTypeName = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteMealType(_ mealType: MealType) async {
        do {
            try await api.deleteMealType(id: mealType.id)
            mealTypes.removeAll { $0.id == mealType.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Visible Nutrients View

struct VisibleNutrientsView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Binding var preferences: Preferences

    @State private var selectedNutrients: Set<String> = []
    @State private var isDirty = false
    @State private var isSaving = false

    private static let nutrientCategories: [(String, [(String, String)])] = [
        ("Fat Breakdown", [
            ("saturatedFat", "Saturated Fat"), ("monounsaturatedFat", "Monounsaturated Fat"),
            ("polyunsaturatedFat", "Polyunsaturated Fat"), ("transFat", "Trans Fat"),
            ("cholesterol", "Cholesterol"), ("omega3", "Omega-3"), ("omega6", "Omega-6"),
        ]),
        ("Sugar & Carbs", [
            ("sugar", "Sugar"), ("addedSugars", "Added Sugars"),
            ("sugarAlcohols", "Sugar Alcohols"), ("starch", "Starch"),
        ]),
        ("Minerals", [
            ("sodium", "Sodium"), ("potassium", "Potassium"), ("calcium", "Calcium"),
            ("iron", "Iron"), ("magnesium", "Magnesium"), ("phosphorus", "Phosphorus"),
            ("zinc", "Zinc"), ("copper", "Copper"), ("manganese", "Manganese"),
            ("selenium", "Selenium"), ("iodine", "Iodine"), ("fluoride", "Fluoride"),
            ("chromium", "Chromium"), ("molybdenum", "Molybdenum"), ("chloride", "Chloride"),
        ]),
        ("Vitamins", [
            ("vitaminA", "Vitamin A"), ("vitaminC", "Vitamin C"), ("vitaminD", "Vitamin D"),
            ("vitaminE", "Vitamin E"), ("vitaminK", "Vitamin K"), ("vitaminB1", "Vitamin B1"),
            ("vitaminB2", "Vitamin B2"), ("vitaminB3", "Vitamin B3"), ("vitaminB5", "Vitamin B5"),
            ("vitaminB6", "Vitamin B6"), ("vitaminB7", "Vitamin B7"), ("vitaminB9", "Vitamin B9"),
            ("vitaminB12", "Vitamin B12"),
        ]),
        ("Other", [
            ("caffeine", "Caffeine"), ("alcohol", "Alcohol"), ("water", "Water"), ("salt", "Salt"),
        ]),
    ]

    private static var allNutrientKeys: [String] {
        nutrientCategories.flatMap { $0.1.map(\.0) }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    Button(L10n.selectAll) {
                        selectedNutrients = Set(Self.allNutrientKeys)
                        isDirty = true
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button(L10n.deselectAll) {
                        selectedNutrients = []
                        isDirty = true
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                }
            }

            ForEach(Self.nutrientCategories, id: \.0) { category, nutrients in
                Section(category) {
                    ForEach(nutrients, id: \.0) { key, label in
                        Toggle(label, isOn: Binding(
                            get: { selectedNutrients.contains(key) },
                            set: { checked in
                                if checked {
                                    selectedNutrients.insert(key)
                                } else {
                                    selectedNutrients.remove(key)
                                }
                                isDirty = true
                            }
                        ))
                    }
                }
            }
        }
        .navigationTitle(L10n.visibleNutrients)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isDirty {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await saveNutrients() }
                    }
                    .disabled(isSaving)
                    .fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            selectedNutrients = Set(preferences.visibleNutrients)
        }
    }

    private func saveNutrients() async {
        isSaving = true
        var update = PreferencesUpdate()
        update.visibleNutrients = Array(selectedNutrients)
        if let updated = try? await api.updatePreferences(update) {
            preferences = updated
        }
        isDirty = false
        isSaving = false
    }
}
