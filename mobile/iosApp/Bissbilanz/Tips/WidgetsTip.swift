import SwiftUI
import TipKit

/// Inline dashboard nudge toward Home Screen / Lock Screen widgets, shown
/// after a user has logged enough that the habit is established. Part of
/// `DashboardView`'s ordered `TipGroup` alongside `WatchAppTip`.
struct WidgetsTip: Tip {
    var title: Text {
        Text(L10n.tipWidgetsTitle)
    }

    var message: Text? {
        Text(L10n.tipWidgetsMessage)
    }

    var image: Image? {
        Image(systemName: "square.grid.2x2")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }

    var rules: [Rule] {
        #Rule(TipEvents.foodLogged) { $0.donations.count >= 10 }
    }
}
