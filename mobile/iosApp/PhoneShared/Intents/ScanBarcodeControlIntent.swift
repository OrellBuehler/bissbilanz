import AppIntents
import Foundation

/// Trivial `OpenIntent` target — the "Scan Barcode" control only ever opens
/// one screen, but `OpenIntent` requires a `target` parameter regardless.
enum ScanBarcodeDestination: String, AppEnum {
    case scanner

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Bissbilanz Screen")
    }

    static var caseDisplayRepresentations: [ScanBarcodeDestination: DisplayRepresentation] {
        [.scanner: DisplayRepresentation(title: "Barcode Scanner")]
    }
}

/// Control Center / Lock Screen / Action Button button that opens the app
/// straight into the barcode scanner (`ScanBarcodeControl` in
/// `BissbilanzWidgets/ControlCenterControls.swift`).
///
/// `OpenIntent` is required here rather than a plain `AppIntent`: Control
/// Center only reliably foregrounds the host app for this specific protocol
/// (a plain intent's now-deprecated `openAppWhenRun` does not launch the app
/// when run from a control). A custom `perform()` is used instead of
/// `OpenURLIntent`/`URLRepresentableIntent`, because that path only supports
/// universal links from a control — a custom URL scheme (all this app has;
/// adding Associated Domains would be a new entitlement) is documented as not
/// working there.
///
/// Same reasoning as `QuickAddFoodIntent`/`EndFastIntent`: this type must
/// compile into the widget extension (so its `ControlWidgetButton` can
/// reference it), so it stays free of app-only dependencies — the
/// `DeepLinkRouter` that actually presents the scanner lives in the app
/// target and can't be referenced from here. Instead this records the
/// pending destination in the App Group, and the app consumes it the next
/// time it activates (see `BissbilanzApp`'s `scenePhase` handler).
struct ScanBarcodeControlIntent: OpenIntent {
    static var title: LocalizedStringResource {
        "Scan Barcode"
    }

    static var description: IntentDescription {
        IntentDescription("Opens Bissbilanz straight into the barcode scanner.")
    }

    @Parameter(title: "Destination")
    var target: ScanBarcodeDestination

    init() {
        target = .scanner
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        ControlCenterPendingAction.set(.scanner)
        return .result()
    }
}
