import SwiftUI
import TipKit

/// Shown once on the dashboard's "edit dashboard" toolbar button. No rules —
/// displays until dismissed or interacted with.
struct DashboardLayoutTip: Tip {
    var title: Text {
        Text(L10n.tipDashboardLayoutTitle)
    }

    var message: Text? {
        Text(L10n.tipDashboardLayoutMessage)
    }

    var image: Image? {
        Image(systemName: "slider.horizontal.3")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }
}
