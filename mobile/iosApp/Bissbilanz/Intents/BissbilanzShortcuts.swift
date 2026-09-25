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
                // Parameterless phrase first: `SiriTipView` displays an
                // intent's first phrase verbatim, and a phrase referencing
                // `\.$food` renders there as the literal placeholder "${food}"
                // since no value is bound yet. All phrases still work for
                // invocation regardless of order.
                "Log a food with \(.applicationName)",
                "Log \(\.$food) with \(.applicationName)",
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
        // Read-only answers. Parameterless on purpose: the day parameter is
        // optional (it defaults to today), and a phrase token has to name a
        // parameter the system can always resolve.
        AppShortcut(
            intent: GetDailyStatusIntent(),
            phrases: [
                "What did I eat today in \(.applicationName)",
                "How many calories did I have in \(.applicationName)",
                "Show my macros in \(.applicationName)",
            ],
            shortTitle: "Daily Status",
            systemImageName: "chart.bar"
        )
        AppShortcut(
            intent: GetWeeklyStatsIntent(),
            phrases: [
                "Weekly summary in \(.applicationName)",
                "How was my week in \(.applicationName)",
            ],
            shortTitle: "Weekly Summary",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: GetWeightIntent(),
            phrases: [
                "What's my weight in \(.applicationName)",
                "Show my weight trend in \(.applicationName)",
            ],
            shortTitle: "Weight",
            systemImageName: "scalemass"
        )
        AppShortcut(
            intent: GetSleepIntent(),
            phrases: [
                "How did I sleep in \(.applicationName)",
                "Show my sleep in \(.applicationName)",
            ],
            shortTitle: "Sleep",
            systemImageName: "bed.double"
        )
    }
}
