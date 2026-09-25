import AppIntents
import AuthenticationServices
import SwiftUI

struct SettingsView: View {
    @Environment(GoalsRepository.self) private var goalsRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    // Meal types are server-only — they stay on the direct API.
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AuthManager.self) private var authManager
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(SyncManager.self) private var syncManager
    @Environment(\.modelContext) private var modelContext
    @Environment(LocalDataMigrator.self) private var migrator
    @Environment(FoodImageLoader.self) private var foodImageLoader
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(FoodLabeler.self) private var foodLabeler

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
    @State private var showDowngradeSheet = false
    @State private var downgradePhase: AccountDowngrader.Phase?
    @State private var downgradeFinished = false
    @State private var downgradeError: String?
    @State private var errorMessage: String?
    @State private var showHelpCenter = false
    private let healthKitService = HealthKitService.shared
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
    @State private var editTargetWeight = ""
    @State private var hasTargetDate = false
    @State private var editTargetDate = Date()
    @State private var editActivityGoalAdjustment = false
    @State private var editActivityCreditPercent = 100
    @State private var waterGoalDraft = "2000"
    @FocusState private var waterGoalFocused: Bool

    var body: some View {
        NavigationStack {
            List {
                // Account status — only when something needs attention
                // (local mode, an expired session, unsynced or failed changes).
                if appModeManager.isLocal || authManager.authState == .expired
                    || syncManager.pendingCount > 0 || syncManager.errors.last != nil
                {
                    Section {
                        accountStatusRows
                    }
                }

                // Goals
                Section {
                    goalRow(L10n.calories, value: goals.calorieGoal, unit: "kcal", color: MacroColors.calories)
                    goalRow(L10n.protein, value: goals.proteinGoal, unit: "g", color: MacroColors.protein)
                    goalRow(L10n.carbs, value: goals.carbGoal, unit: "g", color: MacroColors.carbs)
                    goalRow(L10n.fat, value: goals.fatGoal, unit: "g", color: MacroColors.fat)
                    goalRow(L10n.fiber, value: goals.fiberGoal, unit: "g", color: MacroColors.fiber)
                    // Daily water goal — surfaced on the day card's water tracker.
                    HStack {
                        Text(L10n.settingsWaterGoalLabel)
                        Spacer()
                        TextField("", text: $waterGoalDraft)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                            .focused($waterGoalFocused)
                            .onSubmit { Task { await saveWaterGoal() } }
                        Text(L10n.dayUnitMl)
                            .foregroundStyle(.secondary)
                    }
                    Button(L10n.editGoals) {
                        editCalories = "\(Int(goals.calorieGoal))"
                        editProtein = "\(Int(goals.proteinGoal))"
                        editCarbs = "\(Int(goals.carbGoal))"
                        editFat = "\(Int(goals.fatGoal))"
                        editFiber = "\(Int(goals.fiberGoal))"
                        editTargetWeight = goals.targetWeightKg.map { String(format: "%.1f", $0) } ?? ""
                        hasTargetDate = goals.targetDate != nil
                        editTargetDate = goals.targetDate.flatMap(DateFormatting.date(from:)) ?? Date()
                        editActivityGoalAdjustment = preferences.activityGoalAdjustment
                        editActivityCreditPercent = preferences.activityCreditPercent
                        isEditingGoals = true
                    }
                } header: {
                    Text(L10n.goals)
                } footer: {
                    Text(L10n.settingsWaterGoalDesc)
                }

                // Reference intakes for the nutrient-gap analytics differ by sex;
                // its own section so the "why" can live in the footer.
                Section {
                    Picker(L10n.biologicalSex, selection: biologicalSexBinding) {
                        Text(L10n.biologicalSexNotSet).tag("")
                        Text(L10n.biologicalSexMale).tag("male")
                        Text(L10n.biologicalSexFemale).tag("female")
                    }
                    .pickerStyle(.menu)
                } footer: {
                    Text(L10n.biologicalSexHint)
                }

                // Screens that aren't tabs
                Section(L10n.settingsSectionTracking) {
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
                    NavigationLink { RecipeSuggestionsView() } label: {
                        Label(L10n.recipeSuggestions, systemImage: "fork.knife.circle")
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
                    NavigationLink { RemindersView() } label: {
                        Label(L10n.reminders, systemImage: "bell")
                    }
                }

                // How the app looks and behaves
                Section(L10n.settingsSectionPersonalization) {
                    NavigationLink {
                        TabSelectionView()
                    } label: {
                        HStack {
                            Label(L10n.navigationTabs, systemImage: "rectangle.3.group")
                            Spacer()
                            Text("\(selectedTabNames)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    NavigationLink {
                        DashboardLayoutView()
                    } label: {
                        Label(L10n.dashboardLayout, systemImage: "square.grid.2x2")
                    }
                    NavigationLink {
                        VisibleNutrientsView(preferences: $preferences)
                    } label: {
                        HStack {
                            Label(L10n.visibleNutrients, systemImage: "list.bullet")
                            Spacer()
                            Text("\(preferences.visibleNutrients.count)")
                                .foregroundStyle(.secondary)
                        }
                    }
                    // Custom meal types are server-only — hidden in Local mode.
                    if !appModeManager.isLocal {
                        NavigationLink {
                            MealTypesView(mealTypes: $mealTypes)
                        } label: {
                            HStack {
                                Label(L10n.customMealTypes, systemImage: "fork.knife")
                                Spacer()
                                Text("\(mealTypes.count)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Picker(selection: Binding(
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
                    } label: {
                        Label(L10n.favoriteLogging, systemImage: "star")
                    }
                    .pickerStyle(.menu)
                    Picker(selection: Binding(
                        get: { L10n.currentLocale },
                        set: {
                            L10n.currentLocale = $0
                            WidgetSnapshotWriter.scheduleUpdate(context: modelContext)
                        }
                    )) {
                        ForEach(AppLocale.allCases, id: \.self) { locale in
                            Text(locale.displayName).tag(locale)
                        }
                    } label: {
                        Label(L10n.language, systemImage: "globe")
                    }
                    .pickerStyle(.menu)
                }

                // Apple Health and the server-side AI assistant
                if healthKitService.isAvailable || !appModeManager.isLocal {
                    Section(L10n.settingsSectionIntegrations) {
                        // All Apple Health sync controls live on the subpage.
                        if healthKitService.isAvailable {
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
                        if !appModeManager.isLocal {
                            // MCP is a server-only feature — hidden in Local mode.
                            NavigationLink { ConnectClaudeView() } label: {
                                Label(L10n.connectClaudeTitle, systemImage: "link")
                            }
                            // The queue only exists server-side — the assistant reaches it
                            // over MCP — so it has no meaning in Local mode.
                            NavigationLink { AiTasksView() } label: {
                                Label(L10n.aiTasks, systemImage: "sparkles")
                            }
                        }
                    }
                }

                // AI estimation: whether a meal estimate may fall back to
                // Apple's Private Cloud Compute when on-device estimation isn't
                // available or good enough (MealEstimatorPrivateCloud.swift).
                // Device-local like the tab selection/snooze duration, and
                // shown regardless of AppMode — the fallback is a device/account
                // capability, not a server feature. Hidden when Apple doesn't
                // authorize PCC here (e.g. no entitlement), where it would do nothing.
                if PrivateCloudComputeSettings.isSupported {
                    Section {
                        Toggle(L10n.aiPrivateCloudToggleLabel, isOn: Binding(
                            get: { PrivateCloudComputeSettings.isEnabled },
                            set: { PrivateCloudComputeSettings.isEnabled = $0 }
                        ))
                    } header: {
                        Text(L10n.aiPrivateCloudSectionTitle)
                    } footer: {
                        Text(L10n.aiPrivateCloudToggleFooter)
                    }
                }

                // Food labels: which model does the labelling, auto-labelling
                // new foods, plus a sweep for whatever's still unlabelled.
                // Shown whenever there's a provider worth picking at all —
                // on-device or Private Cloud Compute support, or an account
                // that could have an AI assistant connected — hidden entirely
                // otherwise, since every row would do nothing.
                if foodLabeler.deviceCapableOfLabeling || !appModeManager.isLocal {
                    Section {
                        Picker(selection: Binding(
                            get: { FoodLabelProviderSettings.selected },
                            set: { FoodLabelProviderSettings.selected = $0 }
                        )) {
                            Text(L10n.foodLabelProviderAutomatic).tag(FoodLabelProvider.automatic)
                            Text(L10n.foodLabelProviderOnDevice).tag(FoodLabelProvider.onDeviceOnly)
                            // Hidden, not just disabled, when Apple doesn't
                            // authorize Private Cloud Compute here (e.g. no
                            // entitlement) — same gating as the AI Estimation
                            // toggle above.
                            if PrivateCloudComputeSettings.isSupported {
                                Text(L10n.foodLabelProviderPrivateCloud).tag(FoodLabelProvider.privateCloudCompute)
                            }
                            // MCP is a server-only feature — hidden in Local mode.
                            if !appModeManager.isLocal {
                                Text(L10n.foodLabelProviderMcp).tag(FoodLabelProvider.mcp)
                            }
                        } label: {
                            Label(L10n.foodLabelProviderTitle, systemImage: "sparkles")
                        }
                        .pickerStyle(.menu)
                    } header: {
                        Text(L10n.foodLabelsSectionTitle)
                    } footer: {
                        Text(L10n.foodLabelProviderFooter)
                    }

                    // The two rows below only do anything once the chosen
                    // provider can actually produce a result right now
                    // (`isAvailable` — false for "AI assistant (MCP)" by
                    // design, or for a provider this device can't run).
                    if foodLabeler.isAvailable {
                        Section {
                            Toggle(L10n.autoLabelToggleLabel, isOn: Binding(
                                get: { FoodAutoLabelSettings.isEnabled },
                                set: { FoodAutoLabelSettings.isEnabled = $0 }
                            ))
                            NavigationLink {
                                LabelUnlabeledFoodsView()
                            } label: {
                                HStack {
                                    Text(L10n.labelUnlabeledFoods)
                                    Spacer()
                                    Text(L10n.unlabeledFoodCount(foodRepository.unlabeledLocalFoods().count))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        } footer: {
                            Text(L10n.autoLabelToggleFooter)
                        }
                    }
                }

                // Help
                Section {
                    Button {
                        showHelpCenter = true
                    } label: {
                        Label(L10n.helpAndGuides, systemImage: "questionmark.circle")
                    }
                    Button {
                        UserDefaults.standard.set(true, forKey: BissbilanzApp.resetTipsOnLaunchKey)
                    } label: {
                        Label(L10n.showTipsAgain, systemImage: "lightbulb")
                    }
                } header: {
                    Text(L10n.settingsSectionHelp)
                } footer: {
                    Text(L10n.showTipsAgainFooter)
                }

                // Account actions — signed-in only; sign-in itself sits in the
                // status section at the top.
                if !appModeManager.isLocal {
                    Section(L10n.account) {
                        accountActionRows
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
            // Below the nav title, discovering the quick-add Siri Shortcut.
            // Kept here rather than on the dashboard so it doesn't compete
            // with the ordered `TipGroup` there — the system decides on its
            // own whether/when this is worth showing (no binding needed).
            .safeAreaInset(edge: .top) {
                SiriTipView(intent: LogFoodIntent(), isVisible: nil)
            }
            .sheet(isPresented: $showHelpCenter) {
                SafariView(url: HelpLink.url())
            }
            .keyboardDismissable()
            // The number pad has no return key, so the keyboard toolbar's
            // Done (which resigns focus) is what commits the water goal.
            .onChange(of: waterGoalFocused) { _, focused in
                if !focused { Task { await saveWaterGoal() } }
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

    // MARK: - Account

    @ViewBuilder
    private var accountStatusRows: some View {
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
        }
    }

    @ViewBuilder
    private var accountActionRows: some View {
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
                // wipeLocalData clears the files; this also
                // drops the decoded images the loader still
                // holds in memory, which outlive them.
                foodImageLoader.clear()
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
            Button(L10n.downgradeOption) {
                showDowngradeSheet = true
            }
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
        .sheet(isPresented: $showDowngradeSheet) {
            downgradeSheet
        }
    }

    // MARK: - Biological Sex

    /// "" stands for "not set" so the picker stays a plain `String` selection.
    /// Clearing has to travel as an explicit null — the server only writes the
    /// column when the key is present.
    private var biologicalSexBinding: Binding<String> {
        Binding(
            get: { preferences.biologicalSex ?? "" },
            set: { newValue in
                Task {
                    let stored: String? = newValue.isEmpty ? nil : newValue
                    var update = PreferencesUpdate()
                    update.biologicalSex = .some(stored)
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
                Section {
                    goalField(L10n.calories + " (kcal)", text: $editCalories)
                    goalField(L10n.protein + " (g)", text: $editProtein, share: macroShare(editProtein, kcalPerGram: 4))
                    goalField(L10n.carbs + " (g)", text: $editCarbs, share: macroShare(editCarbs, kcalPerGram: 4))
                    goalField(L10n.fat + " (g)", text: $editFat, share: macroShare(editFat, kcalPerGram: 9))
                    goalField(L10n.fiber + " (g)", text: $editFiber)
                } header: {
                    Text(L10n.dailyGoals)
                } footer: {
                    macroBalanceFooter
                }

                Section(L10n.weightTarget) {
                    goalField(L10n.goalsTargetWeightLabel, text: $editTargetWeight)
                    Toggle(L10n.goalsTargetDateLabel, isOn: $hasTargetDate)
                    if hasTargetDate {
                        DatePicker("", selection: $editTargetDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                    if goals.targetWeightKg != nil || goals.targetDate != nil {
                        Button(L10n.goalsTargetClear, role: .destructive) {
                            editTargetWeight = ""
                            hasTargetDate = false
                        }
                    }
                }

                Section {
                    Toggle(L10n.goalsActivityAdjustmentToggle, isOn: $editActivityGoalAdjustment)
                    if editActivityGoalAdjustment {
                        Stepper(
                            L10n.goalsActivityCreditPercent(editActivityCreditPercent),
                            value: $editActivityCreditPercent,
                            in: 0 ... 100,
                            step: 5
                        )
                    }
                } footer: {
                    Text(L10n.goalsActivityAdjustmentFooter)
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

    private func goalField(_ label: String, text: Binding<String>, share: Int? = nil) -> some View {
        HStack {
            Text(label)
            Spacer()
            if let share {
                Text("\(share)%")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            TextField("", text: text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
        }
    }

    /// Calories a macro's grams contribute, as a share of the calorie goal.
    private func macroShare(_ grams: String, kcalPerGram: Double) -> Int? {
        guard let grams = Double.parseUserInput(grams),
              let calories = Double.parseUserInput(editCalories), calories > 0
        else { return nil }
        return Int((grams * kcalPerGram / calories * 100).rounded())
    }

    /// Calories implied by the protein, carb and fat goals. Fiber is left out:
    /// it is counted within carbs, and its own energy value depends on how
    /// much of it is soluble.
    private var macroCalories: Double? {
        guard let protein = Double.parseUserInput(editProtein),
              let carbs = Double.parseUserInput(editCarbs),
              let fat = Double.parseUserInput(editFat)
        else { return nil }
        return protein * 4 + carbs * 4 + fat * 9
    }

    /// A hint, never a gate: goals that don't add up still save, the user
    /// just gets to see by how much they are off.
    @ViewBuilder
    private var macroBalanceFooter: some View {
        if let macroCalories, let calories = Double.parseUserInput(editCalories), calories > 0 {
            let sum = Int(macroCalories.rounded())
            let goal = Int(calories.rounded())
            let diff = sum - goal
            VStack(alignment: .leading, spacing: 4) {
                // Whole grams move the sum in steps of 4 and 9 kcal, so a few
                // kcal either way is as close as the fields allow.
                if abs(diff) < 10 {
                    Text(L10n.goalsMacroSum(sum))
                } else {
                    let detail = diff < 0
                        ? L10n.goalsMacroShort(-diff, goal: goal)
                        : L10n.goalsMacroOver(diff, goal: goal)
                    Label {
                        Text(L10n.goalsMacroSum(sum) + " " + detail)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                    }
                    .foregroundStyle(.orange)
                }
                Text(L10n.goalsMacroFactors)
            }
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
            sugarGoal: goals.sugarGoal,
            targetWeightKg: Double.parseUserInput(editTargetWeight),
            targetDate: hasTargetDate ? editTargetDate.isoDateString : nil
        )
        do {
            goals = try await goalsRepository.setGoals(newGoals)
        } catch {
            errorMessage = error.localizedDescription
            // The optimistic local write persisted — keep the view in sync with it.
            goals = goalsRepository.goals() ?? .defaults
        }

        var prefsUpdate = PreferencesUpdate()
        prefsUpdate.activityGoalAdjustment = editActivityGoalAdjustment
        prefsUpdate.activityCreditPercent = editActivityCreditPercent
        preferences = await (try? preferencesRepository.update(prefsUpdate))
            ?? (preferencesRepository.preferences() ?? .defaults)

        isEditingGoals = false
    }

    private var downgradeSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if downgradeFinished {
                    Label(L10n.downgradeDone, systemImage: "checkmark.circle")
                    Button(L10n.close) {
                        showDowngradeSheet = false
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                } else if let phase = downgradePhase {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text(phaseLabel(phase))
                    }
                } else {
                    Text(L10n.downgradeMessage)
                    if let downgradeError {
                        Text(downgradeError)
                            .foregroundStyle(.red)
                    }
                    Button(L10n.downgradeConfirm) {
                        downgradeToLocal()
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    Button(L10n.cancel) {
                        showDowngradeSheet = false
                    }
                    .frame(maxWidth: .infinity)
                }
                Spacer()
            }
            .padding()
            .navigationTitle(L10n.downgradeTitle)
            .navigationBarTitleDisplayMode(.inline)
        }
        .interactiveDismissDisabled(downgradePhase != nil)
        .presentationDetents([.medium])
    }

    private func phaseLabel(_ phase: AccountDowngrader.Phase) -> String {
        switch phase {
        case .syncing: L10n.downgradeProgressSync
        case .downloading: L10n.downgradeProgressDownload
        case .deleting: L10n.downgradeProgressDelete
        }
    }

    private func downgradeToLocal() {
        guard downgradePhase == nil else { return }
        downgradeError = nil
        downgradePhase = .syncing
        Task {
            do {
                let downgrader = AccountDowngrader(
                    api: api,
                    context: modelContext,
                    syncManager: syncManager,
                    authManager: authManager,
                    appModeManager: appModeManager
                )
                try await downgrader.downgrade { phase in
                    downgradePhase = phase
                }
                downgradeFinished = true
            } catch let error as AccountDowngrader.DowngradeError {
                ErrorReporter.captureWarning("Account downgrade blocked by pending changes", context: ["reason": ErrorReporter.reason(for: error)])
                downgradeError = L10n.downgradePendingChanges
            } catch {
                ErrorReporter.captureWarning("Account downgrade failed", context: ["reason": ErrorReporter.reason(for: error)])
                downgradeError = L10n.downgradeFailed
            }
            downgradePhase = nil
        }
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
                ErrorReporter.captureWarning("Account data export failed", context: ["reason": ErrorReporter.reason(for: error)])
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
                foodImageLoader.clear()
                authManager.logout()
                appModeManager.clear()
            } catch {
                ErrorReporter.captureWarning("Account deletion failed", context: ["reason": ErrorReporter.reason(for: error)])
                errorMessage = L10n.deleteAccountFailed
            }
            isDeletingAccount = false
        }
    }

    private func loadData() async {
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults
        waterGoalDraft = String(preferences.waterGoalMl ?? 2000)

        async let g: Void? = try? goalsRepository.refresh()
        async let p: Void? = try? preferencesRepository.refresh()

        _ = await (g, p)
        // Meal types are server-only — never fetched in Local mode.
        if !appModeManager.isLocal {
            mealTypes = await (try? api.getMealTypes()) ?? []
        }
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults
        waterGoalDraft = String(preferences.waterGoalMl ?? 2000)
    }

    private func saveWaterGoal() async {
        guard let parsed = Int(waterGoalDraft.trimmingCharacters(in: .whitespaces)) else {
            waterGoalDraft = String(preferences.waterGoalMl ?? 2000)
            return
        }
        let clamped = min(max(parsed, 250), 10000)
        waterGoalDraft = String(clamped)
        guard clamped != (preferences.waterGoalMl ?? 2000) else { return }
        var update = PreferencesUpdate()
        update.waterGoalMl = clamped
        preferences = await (try? preferencesRepository.update(update))
            ?? (preferencesRepository.preferences() ?? .defaults)
    }
}

// MARK: - Meal Types View

/// Custom meal types are server-only — the list stays on the direct API.
struct MealTypesView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Binding var mealTypes: [MealType]

    @State private var newMealTypeName = ""
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
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
        .navigationTitle(L10n.customMealTypes)
        .navigationBarTitleDisplayMode(.inline)
        .keyboardDismissable()
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
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
