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

    @ViewBuilder
    var destination: some View {
        switch self {
        case .foods: FoodSearchView()
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
        let tabs = selectedTabsRaw.split(separator: ",").compactMap { NavigableTab(rawValue: String($0)) }
        // Insights are server-computed stats — the tab is hidden in Local mode.
        return appModeManager.isLocal ? tabs.filter { $0 != .insights } : tabs
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
        // Widget deep links land here as sheets so they work regardless of
        // which tabs the user has configured.
        .sheet(item: $deepLinkRouter.pending) { link in
            NavigationStack {
                switch link {
                case .logFood:
                    FoodSearchView(date: DateFormatting.today)
                case .scanner:
                    BarcodeScannerView()
                case .weight:
                    WeightView()
                case let .food(foodId):
                    FoodDetailView(foodId: foodId)
                case let .recipe(recipeId):
                    RecipeDetailView(recipeId: recipeId)
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
