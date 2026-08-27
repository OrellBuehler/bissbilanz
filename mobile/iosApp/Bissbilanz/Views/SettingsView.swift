import AuthenticationServices
import SwiftUI
import UserNotifications

struct SettingsView: View {
    @Environment(GoalsRepository.self) private var goalsRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    // Meal types are server-only — they stay on the direct API.
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AuthManager.self) private var authManager
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(SyncManager.self) private var syncManager
    @Environment(LocalDataMigrator.self) private var migrator

    @State private var signInSession: ASWebAuthenticationSession?
    @State private var goals: Goals = .defaults
    @State private var preferences: Preferences = .defaults
    @State private var mealTypes: [MealType] = []
    @State private var isEditingGoals = false
    @State private var showLogoutConfirmation = false
    @State private var showDeleteAccountConfirmation = false
    @State private var isDeletingAccount = false
    @State private var isExportingData = false
    @State private var exportedArchive: ExportedArchive?
    @State private var newMealTypeName = ""
    @State private var errorMessage: String?
    private let healthKitService = HealthKitService.shared
    @AppStorage("selected_tabs") private var selectedTabsRaw: String = "foods,favorites,insights"
    // Device-local, like selected_tabs: how long a snooze lasts is a property of the
    // phone you're being reminded on, not something to sync to the account.
    @AppStorage(SupplementReminderScheduler.snoozeMinutesKey)
    private var snoozeMinutes = SupplementReminderScheduler.defaultSnoozeMinutes
    @State private var notificationsAuthorized = true

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
                    NavigationLink { SleepView() } label: {
                        Label(L10n.sleep, systemImage: "bed.double")
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
                    // The maintenance calculator is server-computed — hidden in Local mode.
                    if !appModeManager.isLocal {
                        NavigationLink { MaintenanceView() } label: {
                            Label(L10n.maintenance, systemImage: "function")
                        }
                    }
                }

                // Apple Health — all sync controls live on the subpage.
                if healthKitService.isAvailable {
                    Section(L10n.appleHealth) {
                        NavigationLink {
                            AppleHealthSettingsView()
                        } label: {
                            HStack {
                                Label(L10n.appleHealth, systemImage: "heart")
                                Spacer()
                                Text(
                                    HealthKitService.isAnySyncEnabled
                                        ? L10n.healthConnected
                                        : L10n.healthNotConnected
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
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

                // Custom meal types (server-only, hidden in Local mode)
                if !appModeManager.isLocal {
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
                }

                // Dashboard widgets
                Section(L10n.dashboardWidgets) {
                    Toggle(L10n.caloriesTrend, isOn: widgetBinding(\.showChartWidget, key: "showChartWidget"))
                    Toggle(L10n.favorites, isOn: widgetBinding(\.showFavoritesWidget, key: "showFavoritesWidget"))
                    Toggle(L10n.supplements, isOn: widgetBinding(\.showSupplementsWidget, key: "showSupplementsWidget"))
                    Toggle(L10n.weight, isOn: widgetBinding(\.showWeightWidget, key: "showWeightWidget"))
                    Toggle(L10n.sleep, isOn: widgetBinding(\.showSleepWidget, key: "showSleepWidget"))
                    Toggle(
                        L10n.mealBreakdown,
                        isOn: widgetBinding(\.showMealBreakdownWidget, key: "showMealBreakdownWidget")
                    )
                    Toggle(L10n.topFoods, isOn: widgetBinding(\.showTopFoodsWidget, key: "showTopFoodsWidget"))
                }

                supplementRemindersSection

                // Favorite logging behavior
                Section(L10n.favoriteLogging) {
                    Picker(L10n.favoriteLogging, selection: Binding(
                        get: { preferences.favoriteMealAssignmentMode },
                        set: { newValue in
                            Task {
                                var update = PreferencesUpdate()
                                update.favoriteMealAssignmentMode = newValue
                                preferences = await (try? preferencesRepository.update(update))
                                    ?? (preferencesRepository.preferences() ?? .defaults)
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
                    if appModeManager.isLocal {
                        HStack {
                            Image(systemName: "iphone")
                                .foregroundStyle(.secondary)
                            Text(L10n.localModeStatus)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Button {
                            signInSession = SignInFlow.start(authManager: authManager)
                        } label: {
                            Label(L10n.signInToSync, systemImage: "person.crop.circle")
                        }
                    } else {
                        if authManager.authState == .expired {
                            HStack(alignment: .firstTextBaseline) {
                                Image(systemName: "exclamationmark.triangle")
                                    .foregroundStyle(.orange)
                                Text(L10n.sessionExpiredMessage)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Button {
                                signInSession = SignInFlow.start(authManager: authManager)
                            } label: {
                                Label(L10n.signIn, systemImage: "person.crop.circle")
                            }
                        }
                        if syncManager.pendingCount > 0 {
                            NavigationLink {
                                PendingSyncView()
                            } label: {
                                HStack {
                                    Image(systemName: "arrow.triangle.2.circlepath")
                                        .foregroundStyle(.secondary)
                                    Text(L10n.pendingSyncCount(syncManager.pendingCount))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        if let syncError = syncManager.errors.last {
                            HStack(alignment: .firstTextBaseline) {
                                Image(systemName: "exclamationmark.triangle")
                                    .foregroundStyle(.red)
                                Text(syncError)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        Button {
                            exportData()
                        } label: {
                            HStack {
                                Label(L10n.exportData, systemImage: "square.and.arrow.up")
                                if isExportingData {
                                    Spacer()
                                    ProgressView()
                                }
                            }
                        }
                        .disabled(isExportingData)
                        Button(role: .destructive) {
                            showLogoutConfirmation = true
                        } label: {
                            Label(L10n.signOut, systemImage: "rectangle.portrait.and.arrow.right")
                        }
                        // Anchor the confirmation to the sign-out button itself —
                        // attached to the enclosing List it presents as a popover
                        // pointing at an unrelated row.
                        .confirmationDialog(
                            L10n.signOut + "?",
                            isPresented: $showLogoutConfirmation,
                            titleVisibility: .visible
                        ) {
                            Button(L10n.signOut, role: .destructive) {
                                // The local store and pending queue belong to the
                                // signed-out account — wipe them so nothing leaks
                                // into the next session (Local mode or another
                                // account).
                                migrator.wipeLocalData()
                                authManager.logout()
                                // Reset the mode so the next start shows the login
                                // screen with the mode choice again.
                                appModeManager.clear()
                            }
                            Button(L10n.cancel, role: .cancel) {}
                        } message: {
                            Text(L10n.signOutConfirmation)
                        }
                        Button(role: .destructive) {
                            showDeleteAccountConfirmation = true
                        } label: {
                            Label(L10n.deleteAccount, systemImage: "trash")
                        }
                        .disabled(isDeletingAccount)
                        .confirmationDialog(
                            L10n.deleteAccountTitle,
                            isPresented: $showDeleteAccountConfirmation,
                            titleVisibility: .visible
                        ) {
                            Button(L10n.exportDataFirst) {
                                exportData()
                            }
                            Button(L10n.deleteAccountConfirm, role: .destructive) {
                                deleteAccount()
                            }
                            Button(L10n.cancel, role: .cancel) {}
                        } message: {
                            Text(L10n.deleteAccountConfirmation)
                        }
                        .sheet(item: $exportedArchive) { archive in
                            ShareSheet(url: archive.url)
                        }
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
                    Link(destination: URL(string: "https://bissbilanz.orellbuehler.ch/privacy")!) {
                        Label(L10n.privacyPolicy, systemImage: "hand.raised")
                    }
                    #if DEBUG
                    // Developer-only: verify the Sentry pipeline end-to-end.
                    // Greyed out unless the build was made with a SENTRY_DSN.
                    Button("Send Sentry Test Event") {
                        ErrorReporter.sendTestEvent()
                    }
                    .disabled(!ErrorReporter.isEnabled)
                    #endif
                }
            }
            .navigationTitle(L10n.settings)
            .sheet(isPresented: $isEditingGoals) {
                goalsEditor
            }
            .task { await loadData() }
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
                    case "showSleepWidget": update.showSleepWidget = newValue
                    case "showMealBreakdownWidget": update.showMealBreakdownWidget = newValue
                    case "showTopFoodsWidget": update.showTopFoodsWidget = newValue
                    default: break
                    }
                    preferences = await (try? preferencesRepository.update(update))
                        ?? (preferencesRepository.preferences() ?? .defaults)
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
            .keyboardDismissable()
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
            calorieGoal: Double.parseUserInput(editCalories) ?? goals.calorieGoal,
            proteinGoal: Double.parseUserInput(editProtein) ?? goals.proteinGoal,
            carbGoal: Double.parseUserInput(editCarbs) ?? goals.carbGoal,
            fatGoal: Double.parseUserInput(editFat) ?? goals.fatGoal,
            fiberGoal: Double.parseUserInput(editFiber) ?? goals.fiberGoal,
            sodiumGoal: goals.sodiumGoal,
            sugarGoal: goals.sugarGoal
        )
        do {
            goals = try await goalsRepository.setGoals(newGoals)
        } catch {
            errorMessage = error.localizedDescription
            // The optimistic local write persisted — keep the view in sync with it.
            goals = goalsRepository.goals() ?? .defaults
        }
        isEditingGoals = false
    }

    private func exportData() {
        guard !isExportingData else { return }
        isExportingData = true
        Task {
            defer { isExportingData = false }
            do {
                let data = try await api.exportAccountData()
                let date = Date().ISO8601Format().prefix(10)
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("bissbilanz-export-\(date).zip")
                try data.write(to: url, options: .atomic)
                exportedArchive = ExportedArchive(url: url)
            } catch {
                errorMessage = L10n.exportDataFailed
            }
        }
    }

    private func deleteAccount() {
        isDeletingAccount = true
        Task {
            do {
                try await api.deleteAccount()
                // Same teardown as sign-out: wipe local data before flipping auth
                // state so nothing leaks into the next session.
                migrator.wipeLocalData()
                authManager.logout()
                appModeManager.clear()
            } catch {
                errorMessage = L10n.deleteAccountFailed
            }
            isDeletingAccount = false
        }
    }

    private func loadData() async {
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults

        async let g: Void? = try? goalsRepository.refresh()
        async let p: Void? = try? preferencesRepository.refresh()

        _ = await (g, p)
        // Meal types are server-only — never fetched in Local mode.
        if !appModeManager.isLocal {
            mealTypes = await (try? api.getMealTypes()) ?? []
        }
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults
    }

    private func addMealType() async {
        let name = newMealTypeName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let mealType = try await api.createMealType(name: name, sortOrder: mealTypes.count + 1)
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
    @Environment(PreferencesRepository.self) private var preferencesRepository
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
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
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
        preferences = await (try? preferencesRepository.update(update))
            ?? (preferencesRepository.preferences() ?? .defaults)
        isDirty = false
        isSaving = false
    }
}

private extension SettingsView {
    /// Snooze duration for supplement reminders, plus the authorization status.
    ///
    /// Presets rather than a numeric field — nothing to parse, clamp or reject, and it
    /// stays parallel with the Android dropdown.
    var supplementRemindersSection: some View {
        Section(L10n.reminders) {
            Picker(L10n.snoozeDuration, selection: $snoozeMinutes) {
                ForEach(SupplementReminderScheduler.snoozePresets, id: \.self) { minutes in
                    Text(
                        minutes >= 60 && minutes % 60 == 0
                            ? L10n.snoozeHours(minutes / 60)
                            : L10n.snoozeMinutes(minutes)
                    ).tag(minutes)
                }
            }
            .pickerStyle(.menu)

            if !notificationsAuthorized {
                // A denied authorization can never be re-prompted from the app.
                Text(L10n.notificationsDisabled)
                    .font(.footnote)
                    .foregroundStyle(.red)
                Button(L10n.openSettings) {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
            }
        }
        .task {
            notificationsAuthorized = await SupplementReminderScheduler.authorizationStatus() == .authorized
        }
    }
}

private struct ExportedArchive: Identifiable {
    let url: URL
    var id: String { url.path }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context _: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_: UIActivityViewController, context _: Context) {}
}
