import SwiftUI
import TipKit

/// Shown once on the fasting screen, pointing at the Live Activity that
/// appears once a fast is started. No rules — displays until dismissed.
struct FastingLiveActivityTip: Tip {
    var title: Text {
        Text(L10n.tipFastingLiveActivityTitle)
    }

    var message: Text? {
        Text(L10n.tipFastingLiveActivityMessage)
    }

    var image: Image? {
        Image(systemName: "timer")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }
}
