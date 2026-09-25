import SwiftUI
import TipKit

/// Shown once on the dashboard's add-food button, nudging toward barcode/
/// nutrition-label scanning. No rules — TipKit's default behavior (display
/// until dismissed or interacted with) is exactly "first time" here.
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
}
