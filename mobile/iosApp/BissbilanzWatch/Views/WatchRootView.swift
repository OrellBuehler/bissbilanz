import SwiftUI

/// Four horizontally-paged tabs — Insights, Log, Weight, Sleep. Each tab that
/// needs more than one screen of content nests a vertically-paged `TabView`
/// (the at-a-glance view first, detail/logging below). Complication deep links
/// (`bissbilanz://log`, `…://weight`, `…://sleep`) jump straight to a tab.
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
            InsightsView()
                .tag(Tab.insights)

            NavigationStack {
                LogListView()
            }
            .tag(Tab.log)

            WeightView()
                .tag(Tab.weight)

            SleepView()
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
