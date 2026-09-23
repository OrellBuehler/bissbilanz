import AppIntents
import Foundation

/// Configuration intent for the Quick Add control
/// (`AppIntentControlConfiguration` in
/// `BissbilanzWidgets/ControlCenterControls.swift`) — supplies the picker the
/// user sees when adding the control, choosing which favorite/recent food it
/// logs. `ControlConfigurationIntent` only needs to carry the parameter; the
/// actual log on tap runs through `QuickAddFoodIntent` (the same one the
/// Quick Add widget uses), not this type's `perform()`.
///
/// `food` is optional — required so the system can preview the control
/// before it has been configured (see `ControlConfigurationIntent`'s own
/// note on default values).
struct QuickAddFoodControlIntent: ControlConfigurationIntent {
    static var title: LocalizedStringResource {
        "Quick Add Food"
    }

    static var description: IntentDescription {
        IntentDescription("Choose which favorite or recently logged food this control adds.")
    }

    @Parameter(title: "Food")
    var food: QuickAddFoodEntity?

    init() {}

    init(food: QuickAddFoodEntity?) {
        self.food = food
    }
}
