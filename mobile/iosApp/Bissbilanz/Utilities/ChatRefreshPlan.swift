import Foundation

/// The narrowest refreshes that cover what the assistant changed
/// (docs/ai-chat.md §10): a day per date, a food or recipe per id, and a whole
/// domain when the change carries no scope. Plans merge, so the events of one
/// run coalesce into one pass. Unknown domains are ignored.
struct ChatRefreshPlan: Equatable, Sendable {
    var entryDates: Set<String> = []
    /// Entries changed somewhere unknown (a merge, a forced delete): the
    /// recent days are re-pulled.
    var recentEntries = false
    var dayPropertyDates: Set<String> = []
    var recentDayProperties = false
    var foodIds: Set<String> = []
    var allFoods = false
    var recipeIds: Set<String> = []
    var allRecipes = false
    var goals = false
    var weight = false
    var sleep = false
    var supplements = false
    var preferences = false

    /// More ids than this are cheaper as one incremental mirror or list pull.
    static let maxScopedIds = 20

    init() {}

    init(changes: [ChatChange], changed: [String] = []) {
        let scoped = Self.scopedChanges(changes: changes, changed: changed)
        let touchesFoodsOrRecipes = scoped.contains { $0.domain == "foods" || $0.domain == "recipes" }
        for change in scoped {
            add(change, labelsCovered: touchesFoodsOrRecipes)
        }
        normalize()
    }

    /// `changes` plus an unscoped entry for every domain `changed` names that
    /// `changes` leaves out, so the plain list still counts.
    static func scopedChanges(changes: [ChatChange], changed: [String]) -> [ChatChange] {
        var result = changes
        let covered = Set(changes.map(\.domain))
        for domain in changed where !covered.contains(domain) {
            if !result.contains(where: { $0.domain == domain }) {
                result.append(ChatChange(domain: domain))
            }
        }
        return result
    }

    var isEmpty: Bool {
        self == ChatRefreshPlan()
    }

    mutating func formUnion(_ other: ChatRefreshPlan) {
        entryDates.formUnion(other.entryDates)
        recentEntries = recentEntries || other.recentEntries
        dayPropertyDates.formUnion(other.dayPropertyDates)
        recentDayProperties = recentDayProperties || other.recentDayProperties
        foodIds.formUnion(other.foodIds)
        allFoods = allFoods || other.allFoods
        recipeIds.formUnion(other.recipeIds)
        allRecipes = allRecipes || other.allRecipes
        goals = goals || other.goals
        weight = weight || other.weight
        sleep = sleep || other.sleep
        supplements = supplements || other.supplements
        preferences = preferences || other.preferences
        normalize()
    }

    private mutating func add(_ change: ChatChange, labelsCovered: Bool) {
        let dates = change.dates ?? []
        let ids = change.ids ?? []
        let isUnscoped = dates.isEmpty && ids.isEmpty
        switch change.domain {
        case "entries":
            if dates.isEmpty {
                recentEntries = true
            } else {
                entryDates.formUnion(dates)
            }
        case "dayProperties":
            if dates.isEmpty {
                recentDayProperties = true
            } else {
                dayPropertyDates.formUnion(dates)
            }
        case "foods":
            if ids.isEmpty {
                allFoods = true
            } else {
                foodIds.formUnion(ids)
            }
        case "recipes":
            if ids.isEmpty {
                allRecipes = true
            } else {
                recipeIds.formUnion(ids)
            }
        case "labels":
            // The labelled foods and recipes come with their own entries.
            if !labelsCovered, isUnscoped {
                allFoods = true
                allRecipes = true
            }
        case "goals":
            goals = true
        case "weight":
            weight = true
        case "sleep":
            sleep = true
        case "supplements":
            supplements = true
        case "preferences":
            preferences = true
        default:
            break
        }
    }

    private mutating func normalize() {
        if allFoods || foodIds.count > Self.maxScopedIds {
            allFoods = true
            foodIds = []
        }
        if allRecipes || recipeIds.count > Self.maxScopedIds {
            allRecipes = true
            recipeIds = []
        }
    }
}
