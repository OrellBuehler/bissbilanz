import AuthenticationServices
import SwiftUI

enum NavigableTab: String, CaseIterable, Identifiable {
    case foods
    case favorites
    case insights
    case weight
    case supplements

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .foods: L10n.foods
        case .favorites: L10n.favorites
        case .insights: L10n.insights
        case .weight: L10n.weight
        case .supplements: L10n.supplements
        }
    }

    var icon: String {
        switch self {
        case .foods: "fork.knife"
        case .favorites: "star"
        case .insights: "chart.bar"
        case .weight: "scalemass"
        case .supplements: "pills"
        }
    }

    /// @MainActor because `NavigationStack.init(root:)` is main-actor-isolated;
    /// this builder is only ever read from `ContentView.body` (the main actor).
    @MainActor @ViewBuilder
    var destination: some View {
        switch self {
        // FoodSearchView relies on a navigation container for its search bar,
        // title, toolbar, and navigation destinations (unlike the other tab
        // views, it doesn't wrap itself). The deep-link sheet supplies one; the
        // tab destination must too, otherwise the search field never appears.
        case .foods: NavigationStack { FoodSearchView() }
        case .favorites: FavoritesView()
        case .insights: InsightsView()
        case .weight: WeightView()
        case .supplements: SupplementsView()
        }
    }
}

struct ContentView: View {
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(AuthManager.self) private var authManager
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @AppStorage("selected_tabs") private var selectedTabsRaw: String = "foods,favorites,insights"
    @State private var showSessionExpiredPrompt = false
    @State private var reauthSession: ASWebAuthenticationSession?

    private var selectedTabs: [NavigableTab] {
        selectedTabsRaw.split(separator: ",").compactMap { NavigableTab(rawValue: String($0)) }
    }

    var body: some View {
        @Bindable var deepLinkRouter = deepLinkRouter
        TabView {
            Tab(L10n.home, systemImage: "house") {
                DashboardView()
            }

            ForEach(selectedTabs) { tab in
                Tab(tab.label, systemImage: tab.icon) {
                    tab.destination
                }
            }

            Tab(L10n.settings, systemImage: "gear") {
                SettingsView()
            }
        }
        .minimizableTabBar()
        // Above the tabs so a lost offline edit is visible wherever the user
        // happens to be. Zero-height while there are no notices.
        .safeAreaInset(edge: .top, spacing: 0) {
            SyncConflictBanner()
        }
        // Widget deep links land here as sheets so they work regardless of
        // which tabs the user has configured. Each case picks its own
        // container: the scanner and WeightView bring their own
        // NavigationStack, the rest need one supplied.
        .sheet(item: $deepLinkRouter.pending) { link in
            switch link {
            case .logFood:
                NavigationStack {
                    FoodSearchView(date: DateFormatting.today)
                }
            case .scanner:
                BarcodeScannerView()
            case .weight:
                WeightView()
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
                reauthSession = SignInFlow.start(authManager: authManager)
            }
            Button(L10n.notNow, role: .cancel) {}
        } message: {
            Text(L10n.sessionExpiredMessage)
        }
    }
}
