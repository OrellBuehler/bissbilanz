import AuthenticationServices
import SwiftUI

extension NavigableTab {
    /// The screen on its own, for a navigation stack that already exists — a
    /// push from Settings.
    @MainActor @ViewBuilder
    var screen: some View {
        switch self {
        case .foods: FoodSearchView()
        case .favorites: FavoritesView()
        case .recipes: RecipeListView()
        case .recipeSuggestions: RecipeSuggestionsView()
        case .insights: InsightsView()
        case .calendar: CalendarView()
        case .weight: WeightView()
        case .sleep: SleepView()
        case .fasting: FastingView()
        case .supplements: SupplementsView()
        case .aiTasks: AiTasksView()
        }
    }

    /// The screen as a tab root. @MainActor because `NavigationStack.init(root:)`
    /// is main-actor-isolated; only ever read from `ContentView.body`.
    @MainActor @ViewBuilder
    var tabRoot: some View {
        if wrapsItsOwnNavigationStack {
            screen
        } else {
            // FoodSearchView relies on a navigation container for its search
            // bar, title, toolbar and navigation destinations; the others need
            // one for their title and pushes.
            NavigationStack { screen }
        }
    }

    private var wrapsItsOwnNavigationStack: Bool {
        switch self {
        case .favorites, .recipes, .recipeSuggestions, .insights, .weight, .sleep, .supplements:
            true
        case .foods, .calendar, .fasting, .aiTasks:
            false
        }
    }
}

struct ContentView: View {
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(AuthManager.self) private var authManager
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(FoodPackageInbox.self) private var foodPackageInbox
    @Environment(AiTaskStore.self) private var aiTaskStore
    @AppStorage(TabBarLayout.storageKey) private var selectedTabsRaw: String = TabBarLayout.defaultRaw
    @AppStorage(TabBarLayout.landingStorageKey) private var landingTabRaw: String = TabBarLayout.homeId
    /// Nil until the user switches tabs, so the app opens on the landing tab.
    @State private var selectedTab: String?
    @State private var showSessionExpiredPrompt = false
    @State private var reauthSession: ASWebAuthenticationSession?
    @State private var reauthPrompt: SignInPrompt?

    private var tabLayout: TabBarLayout {
        TabBarLayout(raw: selectedTabsRaw)
    }

    /// Account-only tabs are hidden in Local mode, without touching what is
    /// stored, so they come back after signing in.
    private var visibleTabs: [NavigableTab] {
        tabLayout.visibleTabs(signedIn: !appModeManager.isLocal)
    }

    private var tabSelection: Binding<String> {
        Binding(
            get: {
                tabLayout.selection(
                    current: selectedTab,
                    landing: landingTabRaw,
                    signedIn: !appModeManager.isLocal
                )
            },
            set: { selectedTab = $0 }
        )
    }

    /// Only the AI tasks tab carries a badge; the store is read only while
    /// that tab is in the bar.
    private func badgeCount(for tab: NavigableTab) -> Int {
        tab == .aiTasks ? aiTaskStore.attentionCount : 0
    }

    var body: some View {
        @Bindable var deepLinkRouter = deepLinkRouter
        @Bindable var foodPackageInbox = foodPackageInbox
        TabView(selection: tabSelection) {
            Tab(L10n.home, systemImage: "house", value: TabBarLayout.homeId) {
                DashboardView()
            }

            ForEach(visibleTabs) { tab in
                Tab(tab.label, systemImage: tab.icon, value: tab.rawValue) {
                    tab.tabRoot
                }
                .badge(badgeCount(for: tab))
            }

            Tab(L10n.settings, systemImage: "gear", value: TabBarLayout.settingsId) {
                SettingsView()
            }
        }
        .minimizableTabBar()
        // A widget's plain tap promises the dashboard, also when the app
        // opens on another tab.
        .onChange(of: deepLinkRouter.homeRequested, initial: true) { _, requested in
            guard requested else { return }
            selectedTab = TabBarLayout.homeId
            deepLinkRouter.homeRequested = false
        }
        // Outside the tabs so a lost offline edit is visible wherever the user
        // happens to be. Sits above the tab bar, where every other transient
        // message (`.toast`) already appears — at the top it covered the
        // navigation title and read as a system alert (TestFlight feedback,
        // 1.42.0). Zero-height while there are no notices.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                BulkUploadBanner()
                SyncConflictBanner()
            }
        }
        // Widget deep links land here as sheets so they work regardless of
        // which tabs the user has configured. Each case picks its own
        // container: the scanner and WeightView bring their own
        // NavigationStack, the rest need one supplied.
        .sheet(item: $deepLinkRouter.pending, onDismiss: { deepLinkRouter.dismissedCount += 1 }) { link in
            switch link {
            case .logFood:
                NavigationStack {
                    FoodSearchView(date: DateFormatting.today)
                }
            case .scanner:
                BarcodeScannerView()
            case .weight:
                WeightView()
            case .sleep:
                SleepView()
            case .dashboard:
                DashboardView()
            case let .food(foodId):
                NavigationStack {
                    FoodDetailView(foodId: foodId)
                }
            case let .recipe(recipeId):
                NavigationStack {
                    RecipeDetailView(recipeId: recipeId)
                }
            case .supplements:
                NavigationStack {
                    SupplementsView()
                }
            case .aiTasks:
                NavigationStack {
                    AiTasksView()
                }
            case let .foodSearch(query):
                NavigationStack {
                    FoodSearchView(date: DateFormatting.today, initialQuery: query)
                }
            }
        }
        // A food package opened from another app (Files, Mail, WhatsApp, …). It
        // waits in the inbox until this view exists, i.e. until sign-in or the
        // local-mode choice, and any data migration, are done.
        .sheet(item: $foodPackageInbox.pending, onDismiss: { foodPackageInbox.sheetDismissed() }) { pending in
            NavigationStack {
                FoodPackageImportView(fileURL: pending.url, initialError: pending.error)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(L10n.close) { foodPackageInbox.pending = nil }
                        }
                    }
            }
        }
        // Only users who signed in initially are prompted — Local mode is
        // anonymous by choice and never sees this.
        .onChange(of: authManager.authState, initial: true) { _, state in
            if state == .expired, !appModeManager.isLocal {
                showSessionExpiredPrompt = true
            }
        }
        .alert(L10n.sessionExpiredTitle, isPresented: $showSessionExpiredPrompt) {
            Button(L10n.signIn) {
                beginReauth()
            }
            Button(L10n.notNow, role: .cancel) {}
        } message: {
            Text(L10n.sessionExpiredMessage)
        }
        .sheet(item: $reauthPrompt) { prompt in
            SignInProviderSheet(prompt: prompt)
        }
    }

    private func beginReauth() {
        switch SignInPlan.resolve(lastProvider: authManager.lastProvider, isLocalMode: appModeManager.isLocal) {
        case let .web(provider):
            reauthSession = SignInFlow.start(authManager: authManager, provider: provider)
        case let .prompt(prompt):
            reauthPrompt = prompt
        }
    }
}
