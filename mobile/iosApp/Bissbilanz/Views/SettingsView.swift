import SwiftUI

struct SettingsView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AuthManager.self) private var authManager

    @State private var goals: Goals = .defaults
    @State private var preferences: Preferences = .defaults
    @State private var mealTypes: [MealType] = []
    @State private var isEditingGoals = false
    @State private var showLogoutConfirmation = false
    @State private var newMealTypeName = ""

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
                    Toggle("Chart", isOn: widgetBinding(\.showChartWidget, key: "showChartWidget"))
                    Toggle(L10n.favorites, isOn: widgetBinding(\.showFavoritesWidget, key: "showFavoritesWidget"))
                    Toggle(L10n.supplements, isOn: widgetBinding(\.showSupplementsWidget, key: "showSupplementsWidget"))
                    Toggle(L10n.weight, isOn: widgetBinding(\.showWeightWidget, key: "showWeightWidget"))
                    Toggle(L10n.mealBreakdown, isOn: widgetBinding(\.showMealBreakdownWidget, key: "showMealBreakdownWidget"))
                    Toggle(L10n.topFoods, isOn: widgetBinding(\.showTopFoodsWidget, key: "showTopFoodsWidget"))
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
            .task { await loadData() }
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
        } catch {}
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
        } catch {}
    }

    private func deleteMealType(_ mealType: MealType) async {
        do {
            try await api.deleteMealType(id: mealType.id)
            mealTypes.removeAll { $0.id == mealType.id }
        } catch {}
    }
}
