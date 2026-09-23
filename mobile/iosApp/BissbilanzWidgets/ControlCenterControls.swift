import AppIntents
import SwiftUI
import WidgetKit

/// Control Center / Lock Screen / Action Button controls (iOS 18+). Every
/// action reuses existing `PhoneShared` logic so a control-triggered log or
/// fast syncs exactly like the home-screen widgets already do:
/// - `ScanBarcodeControl` opens the app straight into the barcode scanner.
/// - `QuickAddFoodControl` lets the user pick a favorite/recent food when
///   adding the control, then logs it silently with a default meal by time
///   of day — the same `QuickAddFoodIntent` the Quick Add widget uses.
/// - `FastingControl` starts/ends the fast, reflecting and driving the same
///   Live Activity as the in-app timer and the lock-screen "End Fast" button.
struct ScanBarcodeControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return StaticControlConfiguration(kind: ControlKind.scanBarcode) {
            ControlWidgetButton(action: ScanBarcodeControlIntent()) {
                Label(strings.scan, systemImage: "barcode.viewfinder")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: strings.scanControlDisplayName))
        .description(LocalizedStringResource(stringLiteral: strings.scanControlDescription))
    }
}

struct QuickAddFoodControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return AppIntentControlConfiguration(
            kind: ControlKind.quickAddFood,
            intent: QuickAddFoodControlIntent.self
        ) { configuration in
            ControlWidgetButton(action: QuickAddFoodIntent(
                foodId: configuration.food?.id ?? "",
                foodName: configuration.food?.name ?? ""
            )) {
                Label(
                    configuration.food?.name ?? strings.quickAddControlPlaceholder,
                    systemImage: "plus.circle.fill"
                )
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: strings.quickAddControlDisplayName))
        .description(LocalizedStringResource(stringLiteral: strings.quickAddControlDescription))
        // Opens the food picker right after the control is added, instead of
        // leaving it sitting unconfigured (and unusable — `QuickAddFoodIntent`
        // no-ops on an empty `foodId`) until the user edits it manually.
        .promptsForUserConfiguration()
    }
}

struct FastingControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return StaticControlConfiguration(
            kind: ControlKind.fasting,
            provider: FastingControlValueProvider()
        ) { isFasting in
            ControlWidgetToggle(
                strings.fasting,
                isOn: isFasting,
                action: FastingControlToggleIntent(),
                valueLabel: { isOn in
                    Label(isOn ? strings.fasting : strings.startFast, systemImage: "timer")
                }
            )
        }
        .displayName(LocalizedStringResource(stringLiteral: strings.fastingControlDisplayName))
        .description(LocalizedStringResource(stringLiteral: strings.fastingControlDescription))
    }
}

/// Supplies the fasting toggle's current on/off state — a plain read of the
/// same App Group store the app, the widget extension and `EndFastIntent`
/// all already share (`FastingSessionStore`).
struct FastingControlValueProvider: ControlValueProvider {
    var previewValue: Bool {
        false
    }

    func currentValue() async throws -> Bool {
        FastingSessionStore.loadCurrent() != nil
    }
}
