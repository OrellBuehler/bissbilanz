import AppIntents
import SwiftData
import SwiftUI

// Each section of the settings list is its own `View`, so no single body has to
// describe the whole screen: one huge concrete type made the Swift runtime
// recurse past the main thread's stack while it built the type metadata
// (TestFlight 1.61.0 crash when opening Settings).

struct SettingsAccountStatusSection: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(SyncManager.self) private var syncManager
    let onSignIn: () -> Void

    /// Only when something needs attention: local mode, an expired session,
    /// unsynced or failed changes.
    private var needsAttention: Bool {
        appModeManager.isLocal || authManager.authState == .expired
            || syncManager.pendingCount > 0 || syncManager.failedCount > 0
            || syncManager.errors.last != nil
    }

    var body: some View {
        if needsAttention {
            Section {
                rows
            }
        }
    }

    @ViewBuilder
    private var rows: some View {
        if appModeManager.isLocal {
            HStack {
                Image(systemName: "iphone")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text(L10n.localModeStatus)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Button {
                onSignIn()
            } label: {
                Label(L10n.signInToSync, systemImage: "person.crop.circle")
            }
        } else {
            if authManager.authState == .expired {
                HStack(alignment: .firstTextBaseline) {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .accessibilityHidden(true)
                    Text(L10n.sessionExpiredMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button {
                    onSignIn()
                } label: {
                    Label(L10n.signIn, systemImage: "person.crop.circle")
                }
            }
            if syncManager.pendingCount + syncManager.failedCount > 0 {
                NavigationLink {
                    PendingSyncView()
                } label: {
                    HStack {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                        Text(L10n.pendingSyncCount(syncManager.pendingCount + syncManager.failedCount))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if let syncError = syncManager.errors.last {
                HStack(alignment: .firstTextBaseline) {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .accessibilityHidden(true)
                    Text(syncError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
    }
}

/// Reference intakes for the nutrient-gap analytics differ by sex; its own
/// section so the "why" can live in the footer.
struct SettingsBiologicalSexSection: View {
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Binding var preferences: Preferences

    var body: some View {
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
    }

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
}

/// A screen the tab bar can hold, pushed onto Settings' own navigation stack.
struct SettingsScreenLink: View {
    let tab: NavigableTab

    var body: some View {
        NavigationLink {
            tab.screen
        } label: {
            Label(tab.label, systemImage: tab.icon)
        }
    }
}

/// Every screen the tab bar can hold, reachable here whatever the tab bar
/// shows. AI tasks and the chat sit under Integrations, as they need an account.
struct SettingsScreenSections: View {
    @Environment(AppModeManager.self) private var appModeManager

    var body: some View {
        Section(L10n.settingsSectionFood) {
            SettingsScreenLink(tab: .foods)
            SettingsScreenLink(tab: .favorites)
            SettingsScreenLink(tab: .recipes)
            SettingsScreenLink(tab: .recipeSuggestions)
        }

        Section(L10n.settingsSectionTracking) {
            SettingsScreenLink(tab: .weight)
            SettingsScreenLink(tab: .sleep)
            SettingsScreenLink(tab: .fasting)
            SettingsScreenLink(tab: .supplements)
            NavigationLink { RemindersView() } label: {
                Label(L10n.reminders, systemImage: "bell")
            }
        }

        Section(L10n.settingsSectionAnalysis) {
            SettingsScreenLink(tab: .insights)
            SettingsScreenLink(tab: .calendar)
            // The maintenance calculator is server-computed — hidden in Local mode.
            if !appModeManager.isLocal {
                NavigationLink { MaintenanceView() } label: {
                    Label(L10n.maintenance, systemImage: "function")
                }
            }
        }
    }
}

/// How the app looks and behaves.
struct SettingsPersonalizationSection: View {
    @Environment(AppModeManager.self) private var appModeManager
    @Binding var preferences: Preferences
    @Binding var mealTypes: [MealType]

    var body: some View {
        Section(L10n.settingsSectionPersonalization) {
            SettingsTabsLink()
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
            SettingsFavoriteLoggingPicker(preferences: $preferences)
            SettingsLanguagePicker()
            SettingsAppearancePicker()
        }
    }
}

private struct SettingsTabsLink: View {
    @Environment(AppModeManager.self) private var appModeManager
    @AppStorage(TabBarLayout.storageKey) private var selectedTabsRaw: String = TabBarLayout.defaultRaw

    private var selectedTabNames: String {
        TabBarLayout(raw: selectedTabsRaw)
            .visibleTabs(signedIn: !appModeManager.isLocal)
            .map(\.label)
            .joined(separator: ", ")
    }

    var body: some View {
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
    }
}

private struct SettingsFavoriteLoggingPicker: View {
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Binding var preferences: Preferences

    var body: some View {
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
    }
}

private struct SettingsLanguagePicker: View {
    @Environment(\.modelContext) private var modelContext

    var body: some View {
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
}

private struct SettingsAppearancePicker: View {
    @AppStorage(AppTheme.storageKey) private var appThemeRaw = AppTheme.system.rawValue

    var body: some View {
        Picker(selection: Binding(
            get: { AppTheme(rawValue: appThemeRaw) ?? .system },
            set: { appThemeRaw = $0.rawValue }
        )) {
            ForEach(AppTheme.allCases) { theme in
                Text(theme.label).tag(theme)
            }
        } label: {
            Label(L10n.appearance, systemImage: "circle.lefthalf.filled")
        }
        .pickerStyle(.menu)
    }
}

/// Apple Health and the server-side AI assistant.
struct SettingsIntegrationsSection: View {
    @Environment(AppModeManager.self) private var appModeManager
    private let healthKitService = HealthKitService.shared

    var body: some View {
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
                    NavigationLink { ConnectAssistantView() } label: {
                        Label(L10n.connectAssistantTitle, systemImage: "link")
                    }
                    // The queue only exists server-side — the assistant reaches it
                    // over MCP — so it has no meaning in Local mode.
                    SettingsScreenLink(tab: .aiTasks)
                    // The assistant runs on the server, so the chat needs an account too.
                    SettingsScreenLink(tab: .chat)
                }
            }
        }
    }
}

/// Food labels: which model does the labelling, auto-labelling new foods and
/// recipes, plus a sweep for whatever's still unlabelled. Shown whenever
/// there's a provider worth picking at all — on-device or Private Cloud
/// Compute support, or an account that could have an AI assistant connected —
/// hidden entirely otherwise, since every row would do nothing.
struct SettingsFoodLabelsSection: View {
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(FoodLabeler.self) private var foodLabeler

    var body: some View {
        if foodLabeler.deviceCapableOfLabeling || !appModeManager.isLocal {
            providerSection
            // The two rows below only do anything once the chosen provider can
            // actually produce a result right now (`isAvailable` — false for
            // "AI assistant (MCP)" by design, or for a provider this device
            // can't run).
            if foodLabeler.isAvailable {
                SettingsAutoLabelSection()
            }
        }
    }

    private var providerSection: some View {
        Section {
            Picker(selection: Binding(
                get: { FoodLabelProviderSettings.selected },
                set: { FoodLabelProviderSettings.selected = $0 }
            )) {
                Text(L10n.foodLabelProviderAutomatic).tag(FoodLabelProvider.automatic)
                Text(L10n.foodLabelProviderOnDevice).tag(FoodLabelProvider.onDeviceOnly)
                // Hidden, not just disabled, when Apple doesn't authorize
                // Private Cloud Compute here (e.g. no entitlement) — same
                // gating as the AI Estimation toggle.
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
    }
}

private struct SettingsAutoLabelSection: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository

    private var unlabeledSummary: String {
        L10n.unlabeledCount(
            foods: foodRepository.unlabeledLocalFoods().count,
            recipes: recipeRepository.unlabeledLocalRecipes().count
        )
    }

    var body: some View {
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
                    Text(unlabeledSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text(L10n.autoLabelToggleFooter)
        }
    }
}

/// Enhance Foods: Open Food Facts scores and label details for barcode foods
/// that lack them. No AI involved, so it sits outside the food-labels gate.
/// Always present: removing a NavigationLink pops its destination, and the
/// count changes while the screen is open.
struct SettingsEnhanceFoodsSection: View {
    @Environment(FoodEnrichmentController.self) private var foodEnrichment

    var body: some View {
        Section {
            NavigationLink {
                EnhanceFoodsView()
            } label: {
                HStack {
                    Text(L10n.enhanceFoods)
                    Spacer()
                    if let enhanceSummary = foodEnrichment.settingsSummary {
                        Text(enhanceSummary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } footer: {
            Text(L10n.enhanceFoodsFooter)
        }
    }
}

struct SettingsHelpSection: View {
    @Binding var showHelpCenter: Bool
    @AppStorage(TipSettings.enabledKey) private var tipsEnabled = true

    var body: some View {
        Section {
            Button {
                showHelpCenter = true
            } label: {
                Label(L10n.helpAndGuides, systemImage: "questionmark.circle")
            }
            Toggle(isOn: $tipsEnabled) {
                Label(L10n.showTips, systemImage: "lightbulb")
            }
            .onChange(of: tipsEnabled) { _, enabled in
                TipSettings.isEnabled = enabled
                // Tips already dismissed only come back through a
                // datastore reset, which TipKit allows only before
                // `Tips.configure` — so on the next launch.
                UserDefaults.standard.set(enabled, forKey: BissbilanzApp.resetTipsOnLaunchKey)
            }
        } header: {
            Text(L10n.settingsSectionHelp)
        } footer: {
            Text(tipsEnabled ? L10n.showTipsOnFooter : L10n.showTipsOffFooter)
        }
    }
}

/// Discovering the quick-add Siri Shortcut. Sits down here (pinned above the
/// list it read as stuck) with a persisted binding so dismissing it sticks —
/// `SiriTipView` doesn't remember that on its own.
struct SettingsSiriSection: View {
    @AppStorage("show_siri_log_food_tip") private var showSiriLogFoodTip = true

    var body: some View {
        Section {
            SiriTipView(intent: LogFoodIntent(), isVisible: $showSiriLogFoodTip)
        }
    }
}

struct SettingsAboutSection: View {
    var body: some View {
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
}
