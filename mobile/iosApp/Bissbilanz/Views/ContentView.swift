import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            Tab(L10n.home, systemImage: "house") {
                DashboardView()
            }

            Tab(L10n.foods, systemImage: "fork.knife") {
                FoodSearchView()
            }

            Tab(L10n.favorites, systemImage: "star") {
                FavoritesView()
            }

            Tab(L10n.insights, systemImage: "chart.bar") {
                InsightsView()
            }

            Tab(L10n.settings, systemImage: "gear") {
                SettingsView()
            }
        }
    }
}
