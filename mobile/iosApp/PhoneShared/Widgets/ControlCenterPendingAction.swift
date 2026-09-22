import Foundation

/// Cross-process handoff for a Control Center action that needs the app's own
/// UI to finish the job — currently just "open the barcode scanner"
/// (`ScanBarcodeControlIntent`). Mirrors `FastingSessionStore`: written from
/// wherever the control's intent actually runs, consumed once from the app
/// side (`BissbilanzApp`'s `scenePhase` handler, the same activation hook
/// `FastingTimerManager.refresh()` uses to reconcile external changes).
///
/// `OpenIntent` guarantees the system brings the app to the foreground, but
/// its `perform()` still has to compile inside the widget extension target
/// (the control's `ControlWidgetButton` constructs it there) — so it can't
/// reference the app-only `DeepLinkRouter` directly, the same reason
/// `QuickAddFoodIntent`/`EndFastIntent` avoid app-only dependencies. Consumed
/// with `consume()`, which clears the flag as it reads it so a relaunch that
/// races the read never replays the same tap twice.
enum ControlCenterPendingAction: String {
    case scanner

    private static let key = "control_center_pending_action_v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: WidgetSnapshotStore.appGroupId)
    }

    static func set(_ action: ControlCenterPendingAction) {
        defaults?.set(action.rawValue, forKey: key)
    }

    static func consume() -> ControlCenterPendingAction? {
        guard let raw = defaults?.string(forKey: key) else { return nil }
        defaults?.removeObject(forKey: key)
        return ControlCenterPendingAction(rawValue: raw)
    }
}
