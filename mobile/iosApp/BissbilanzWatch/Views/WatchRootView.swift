import SwiftUI

/// Two vertically-paged screens: today's rings and the quick-log list. The
/// `bissbilanz://log` deep link (opened by tapping a complication) jumps
/// straight to the log screen.
struct WatchRootView: View {
    private enum Tab: Hashable {
        case today
        case log
    }

    @State private var selection: Tab = .today

    var body: some View {
        TabView(selection: $selection) {
            TodayView()
                .tag(Tab.today)

            NavigationStack {
                LogListView()
            }
            .tag(Tab.log)
        }
        .tabViewStyle(.verticalPage)
        .onOpenURL { url in
            if url.host == "log" {
                selection = .log
            }
        }
    }
}
