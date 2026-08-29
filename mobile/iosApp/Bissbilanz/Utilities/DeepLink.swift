import Foundation
import Observation

/// In-app destinations reachable from outside the app (widgets). The
/// `bissbilanz://callback` host stays reserved for the OIDC redirect and is
/// not parsed here.
enum DeepLink: Equatable, Identifiable {
    case logFood
    case scanner
    case weight
    case food(String)
    case recipe(String)
    /// Tapping a supplement reminder's body.
    case supplements
    /// Tapping a dismissed-AI-task notification's body.
    case aiTasks

    var id: String {
        switch self {
        case .logFood: "log"
        case .scanner: "scan"
        case .weight: "weight"
        case let .food(foodId): "food-\(foodId)"
        case let .recipe(recipeId): "recipe-\(recipeId)"
        case .supplements: "supplements"
        case .aiTasks: "ai-tasks"
        }
    }

    /// Parses a `bissbilanz://` URL. Returns nil for the auth callback,
    /// plain open-the-app links (`bissbilanz://today`) and anything unknown.
    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme == "bissbilanz" else { return nil }
        switch url.host {
        case "log":
            return .logFood
        case "scan":
            return .scanner
        case "weight":
            return .weight
        case "food":
            let foodId = url.pathComponents
                .first { $0 != "/" }?
                .removingPercentEncoding
            guard let foodId, !foodId.isEmpty else { return nil }
            return .food(foodId)
        case "recipe":
            let recipeId = url.pathComponents
                .first { $0 != "/" }?
                .removingPercentEncoding
            guard let recipeId, !recipeId.isEmpty else { return nil }
            return .recipe(recipeId)
        default:
            return nil
        }
    }
}

/// Bridges incoming deep links from the App scene to whichever view presents
/// them (ContentView shows the matching sheet).
@MainActor
@Observable
final class DeepLinkRouter {
    var pending: DeepLink?
}
