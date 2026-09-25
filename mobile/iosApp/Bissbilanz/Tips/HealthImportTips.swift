import SwiftUI
import TipKit

/// Shown on `WeightView` while Apple Health weight import is off. Separate
/// `@Parameter` from `HealthImportSleepTip` — the two screens gate on
/// different settings (`HealthKitService.syncEnabledKey` vs
/// `readSleepEnabledKey`), so a shared parameter would make one screen's
/// state leak into the other's eligibility.
struct HealthImportWeightTip: Tip {
    @Parameter
    static var isImportDisabled: Bool = true

    var title: Text {
        Text(L10n.tipHealthImportTitle)
    }

    var message: Text? {
        Text(L10n.tipHealthImportMessage)
    }

    var image: Image? {
        Image(systemName: "heart.text.square")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }

    var rules: [Rule] {
        #Rule(Self.$isImportDisabled) { $0 == true }
    }
}

/// Shown on `SleepView` while Apple Health sleep import is off. See
/// `HealthImportWeightTip` for why this isn't the same tip.
struct HealthImportSleepTip: Tip {
    @Parameter
    static var isImportDisabled: Bool = true

    var title: Text {
        Text(L10n.tipHealthImportTitle)
    }

    var message: Text? {
        Text(L10n.tipHealthImportMessage)
    }

    var image: Image? {
        Image(systemName: "heart.text.square")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }

    var rules: [Rule] {
        #Rule(Self.$isImportDisabled) { $0 == true }
    }
}
