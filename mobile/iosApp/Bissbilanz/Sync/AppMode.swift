import Foundation
import Observation

/// How the app stores and syncs data.
///
/// - `local`: anonymous, no backend. The SwiftData store is the primary store;
///   nothing is ever enqueued for sync and refresh calls are no-ops.
/// - `synced`: logged in. The backend is the source of truth; the local store is
///   an offline cache and writes are queued for upload.
enum AppMode: String {
    case local
    case synced
}

/// Holds the persisted app mode. A `nil` mode means the user has not chosen yet —
/// this is also the state for existing logged-in installs after an upgrade, which
/// must keep behaving exactly as before. Therefore anything other than
/// `AppMode.local` (including `nil`) is treated as "sync allowed". Mirrors the
/// Android `AppModeManager` (same UserDefaults key and semantics).
@MainActor
@Observable
final class AppModeManager {
    private(set) var mode: AppMode?

    private let defaults: UserDefaults
    private static let key = "app_mode"

    var isLocal: Bool {
        mode == .local
    }

    /// Loads the persisted mode immediately — repositories and the sync queue
    /// consult it from their first call.
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        mode = defaults.string(forKey: Self.key).flatMap(AppMode.init(rawValue:))
    }

    func setMode(_ mode: AppMode) {
        defaults.set(mode.rawValue, forKey: Self.key)
        self.mode = mode
        // Mirror to the App Group so the widget extension (a separate process,
        // unable to reach `.standard`) can read it via `AppModeSnapshot`.
        UserDefaults(suiteName: WidgetSnapshotStore.appGroupId)?.set(mode.rawValue, forKey: AppModeSnapshot.key)
    }

    /// Clears the persisted mode (used on logout) so the next start shows the
    /// login screen with the mode choice again.
    func clear() {
        defaults.removeObject(forKey: Self.key)
        mode = nil
        UserDefaults(suiteName: WidgetSnapshotStore.appGroupId)?.removeObject(forKey: AppModeSnapshot.key)
    }
}
