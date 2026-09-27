import SwiftUI
import TipKit

/// Shown once on the dashboard's add-food button, nudging toward barcode/
/// nutrition-label scanning. Gated only on the Settings switch — TipKit's
/// default behavior (display until dismissed or interacted with) is exactly
/// "first time" here. `DashboardView` invalidates it once the user picks Scan
/// Barcode or opens Learn more, so it stops coming back once the feature has
/// been found.
struct ScanningTip: Tip {
    var title: Text {
        Text(L10n.tipScanningTitle)
    }

    var message: Text? {
        Text(L10n.tipScanningMessage)
    }

    var image: Image? {
        Image(systemName: "barcode.viewfinder")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }

    var rules: [Rule] {
        #Rule(TipSettings.$isEnabled) { $0 == true }
    }
}
