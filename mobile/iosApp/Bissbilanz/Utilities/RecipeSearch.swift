import Foundation

/// Recipe search shared by every picker: a name match, then a label match, with
/// the query folded exactly like a stored label (`LabelNormalizer`) — the same
/// tiers and predicates foods use (`FoodRepository.searchLocal`), so "Soups"
/// finds a recipe labelled "soup" whatever language its name is in.
enum RecipeSearch {
    nonisolated static func matchesName(_ recipe: Recipe, query: String) -> Bool {
        recipe.name.localizedCaseInsensitiveContains(query)
    }

    nonisolated static func matchesLabel(_ recipe: Recipe, query: String) -> Bool {
        guard let label = LabelNormalizer.normalize(query) else { return false }
        return recipe.labels?.contains(label) == true
    }

    /// Whether `recipe` matches by name or by label. An empty query matches everything,
    /// so a filter over a list can call this unconditionally.
    nonisolated static func matches(_ recipe: Recipe, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        return matchesName(recipe, query: trimmed) || matchesLabel(recipe, query: trimmed)
    }

    /// Name matches first, then label matches, each alphabetical. A blank query
    /// matches nothing.
    nonisolated static func matching(_ recipes: [Recipe], query: String) -> [Recipe] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let byName = recipes.filter { matchesName($0, query: trimmed) }
        let byLabel = recipes.filter { !matchesName($0, query: trimmed) && matchesLabel($0, query: trimmed) }
        return alphabetical(byName) + alphabetical(byLabel)
    }

    private nonisolated static func alphabetical(_ recipes: [Recipe]) -> [Recipe] {
        recipes.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}
