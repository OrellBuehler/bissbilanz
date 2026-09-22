import AppIntents
import Foundation

/// Control Center / Lock Screen / Action Button toggle for the fasting
/// tracker (`FastingControl` in
/// `BissbilanzWidgets/ControlCenterControls.swift`), reflecting whether a
/// fast is currently running.
///
/// Starting a fast calls `Activity.request`, which Apple's ActivityKit docs
/// say only works while the app is foreground *unless* the call happens
/// inside a `LiveActivityIntent`'s `perform()` — the system then launches the
/// app process (without opening its UI) to run it. Conforming to both
/// `SetValueIntent` (what `ControlWidgetToggle` requires as its action) and
/// `LiveActivityIntent` gets both: the toggle behavior and a process where
/// starting the Live Activity is actually allowed.
///
/// The "off" branch reuses `EndFastIntent` itself rather than duplicating its
/// logic, so the Live Activity ends the same way whether the tap came from
/// the lock screen banner or from Control Center.
struct FastingControlToggleIntent: SetValueIntent, LiveActivityIntent {
    /// Default protocol when starting from the control (no room for a picker
    /// here) — matches `FastingView`'s default preset (16:8).
    static let defaultTargetHours = 16

    static var title: LocalizedStringResource {
        "Fasting"
    }

    static var description: IntentDescription {
        IntentDescription("Starts or ends your fast from Control Center, in step with the Live Activity.")
    }

    @Parameter(title: "Fasting")
    var value: Bool

    init() {
        value = false
    }

    init(value: Bool) {
        self.value = value
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        if value {
            FastingWriter.startFast(targetHours: Self.defaultTargetHours)
        } else {
            _ = try await EndFastIntent().perform()
        }
        return .result()
    }
}
