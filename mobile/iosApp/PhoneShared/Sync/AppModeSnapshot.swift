import Foundation

/// Read-only mirror of `AppModeManager`'s persisted choice, for code that
/// can't reach the app's private `UserDefaults.standard` — namely the widget
/// extension. Written by `AppModeManager.setMode`/`clear` alongside the app's
/// own `.standard` write; `.standard` stays the source of truth for the app.
///
/// Matches `AppModeManager.isLocal`'s semantics exactly: an absent value
/// (fresh install, or an existing install that hasn't opened the updated app
/// yet) means "sync allowed", not Local mode — never default a missing value
/// to `true` here.
enum AppModeSnapshot {
    static let key = "app_mode"

    static var isLocal: Bool {
        UserDefaults(suiteName: WidgetSnapshotStore.appGroupId)?.string(forKey: key) == "local"
    }
}
