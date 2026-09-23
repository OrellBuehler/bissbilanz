import Foundation

/// `kind` identifiers for the Control Center / Lock Screen / Action Button
/// controls (`BissbilanzWidgets/ControlCenterControls.swift`). Kept in
/// `PhoneShared/` rather than alongside the `ControlWidget` declarations
/// themselves so app-side code that needs to reload a control's state
/// (`ControlCenter.shared.reloadControls(ofKind:)`, e.g. `FastingWriter`,
/// `FastingTimerManager`) doesn't have to depend on the widget extension's
/// own target.
enum ControlKind {
    static let scanBarcode = "ScanBarcodeControl"
    static let quickAddFood = "QuickAddFoodControl"
    static let fasting = "FastingControl"
}
