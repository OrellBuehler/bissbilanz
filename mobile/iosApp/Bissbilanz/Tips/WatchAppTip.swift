import SwiftUI
import TipKit

/// Inline dashboard nudge to install the Apple Watch app, shown only when a
/// watch is paired but doesn't have it yet. `isEligible` is refreshed by
/// `DashboardView` from `PhoneWatchConnectivity` (the app's one `WCSession`
/// owner) rather than this tip touching `WCSession` itself. Second in
/// `DashboardView`'s ordered `TipGroup`, after `WidgetsTip`.
struct WatchAppTip: Tip {
    @Parameter
    static var isEligible: Bool = false

    var title: Text {
        Text(L10n.tipWatchAppTitle)
    }

    var message: Text? {
        Text(L10n.tipWatchAppMessage)
    }

    var image: Image? {
        Image(systemName: "applewatch")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }

    var rules: [Rule] {
        #Rule(Self.$isEligible) { $0 == true }
        #Rule(TipSettings.$isEnabled) { $0 == true }
    }
}
