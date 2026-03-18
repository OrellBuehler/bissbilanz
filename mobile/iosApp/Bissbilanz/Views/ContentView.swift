import SwiftUI

enum NavigableTab: String, CaseIterable, Identifiable {
    case foods
    case favorites
    case insights
    case weight
    case supplements

    var id: String { rawValue }

    var label: String {
        switch self {
        case .foods: return L10n.foods
        case .favorites: return L10n.favorites
        case .insights: return L10n.insights
        case .weight: return L10n.weight
        case .supplements: return L10n.supplements
        }
    }

    var icon: String {
        switch self {
        case .foods: return "fork.knife"
        case .favorites: return "star"
        case .insights: return "chart.bar"
        case .weight: return "scalemass"
        case .supplements: return "pills"
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
    @AppStorage("selected_tabs") private var selectedTabsRaw: String = "foods,favorites,insights"

    private var selectedTabs: [NavigableTab] {
        selectedTabsRaw.split(separator: ",").compactMap { NavigableTab(rawValue: String($0)) }
    }

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label(L10n.home, systemImage: "house")
                }

            ForEach(selectedTabs) { tab in
                tab.destination
                    .tabItem {
                        Label(tab.label, systemImage: tab.icon)
                    }
            }

            SettingsView()
                .tabItem {
                    Label(L10n.settings, systemImage: "gear")
                }
        }
    }
}
