import SwiftUI

/// Four horizontally-paged tabs — Insights, Log, Weight, Sleep. Each tab is a
/// single glance in its own `NavigationStack`; logging opens from the toolbar
/// (a sheet for weight and sleep, a pushed detail for food). Complication deep
/// links (`bissbilanz://log`, `…://weight`, `…://sleep`) jump straight to a tab.
struct WatchRootView: View {
    private enum Tab: Hashable {
        case insights
        case log
        case weight
        case sleep
    }

    @State private var selection: Tab = .insights

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack {
                InsightsView()
            }
            .watchTabBackground(MacroColors.calories)
            .tag(Tab.insights)

            NavigationStack {
                LogListView()
            }
            .watchTabBackground(MacroColors.carbs)
            .tag(Tab.log)

            NavigationStack {
                WeightView()
            }
            .watchTabBackground(.teal)
            .tag(Tab.weight)

            NavigationStack {
                SleepView()
            }
            .watchTabBackground(.indigo)
            .tag(Tab.sleep)
        }
        .tabViewStyle(.page)
        .onOpenURL { url in
            switch url.host {
            case "log": selection = .log
            case "weight": selection = .weight
            case "sleep": selection = .sleep
            default: selection = .insights
            }
        }
    }
}

extension View {
    /// Subtle tinted gradient behind a tab, the way Apple's own watch apps
    /// identify each page — kept faint so the data stays the loudest thing.
    func watchTabBackground(_ color: Color) -> some View {
        containerBackground(color.opacity(0.35).gradient, for: .tabView)
    }
}
