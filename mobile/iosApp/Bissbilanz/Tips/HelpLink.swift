import Foundation

/// Fixed slugs the public help center (a separate SvelteKit route, built and
/// deployed independently of the app) serves at `/help/<slug>` — see
/// `docs/help-center` on the server for the source of truth. Keep this list in
/// sync with the server's routes; a slug with no matching page there 404s.
enum HelpSlug: String {
    case gettingStarted = "getting-started"
    case logging
    case scanning
    case foodDatabase = "food-database"
    case recipes
    case goalsMaintenance = "goals-maintenance"
    case bodyTracking = "body-tracking"
    case insights
    case aiAssistant = "ai-assistant"
    case importExport = "import-export"
    case mobileExtras = "mobile-extras"
    case syncOffline = "sync-offline"
}

/// Builds the localized help center URL for a tip's "Learn more" action or
/// the Settings help row. German devices land on the `/de/help/...` prefix —
/// the help center has no other locales, mirroring the app's own `AppLocale`.
enum HelpLink {
    private static let baseURL = "https://bissbilanz.orellbuehler.ch"

    /// The help center home page, or a specific guide when `slug` is given.
    static func url(for slug: HelpSlug? = nil) -> URL {
        let prefix = L10n.currentLocale == .de ? "/de/help" : "/help"
        let path = slug.map { "\(prefix)/\($0.rawValue)" } ?? prefix
        return URL(string: baseURL + path) ?? URL(string: baseURL)!
    }
}
