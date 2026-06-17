import AppIntents

/// Registers the app's shortcuts so they appear automatically in the Shortcuts
/// app, Spotlight and Siri at install — no donation needed for these to exist.
///
/// Constraints enforced by the framework: every phrase must contain
/// `\(.applicationName)`, a phrase may reference at most one parameter, and a
/// provider may expose at most 10 shortcuts.
struct BissbilanzShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogFoodIntent(),
            phrases: [
                "Log \(\.$food) with \(.applicationName)",
                "Log a food with \(.applicationName)",
                "Add food to \(.applicationName)",
            ],
            shortTitle: "Log Food",
            systemImageName: "fork.knife"
        )
        AppShortcut(
            intent: LogRecipeIntent(),
            phrases: [
                "Log \(\.$recipe) with \(.applicationName)",
                "Log a recipe with \(.applicationName)",
            ],
            shortTitle: "Log Recipe",
            systemImageName: "list.bullet.rectangle"
        )
    }
}
