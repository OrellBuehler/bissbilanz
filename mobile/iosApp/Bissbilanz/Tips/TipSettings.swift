import TipKit

/// The Settings "Show tips" switch, mirrored into TipKit so every tip's rules
/// can gate on it and hide at once. `UserDefaults` (`enabledKey`) is the
/// source of truth; `BissbilanzApp` copies it in after `Tips.configure`.
enum TipSettings {
    static let enabledKey = "tips_enabled"

    @Parameter
    static var isEnabled: Bool = true
}
