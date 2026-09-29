import Foundation

/// One diary entry that references a food or recipe.
struct WhereUsedEntry: Codable, Identifiable {
    let id: String
    let date: String
    let mealType: String
    let servings: Double
    /// Always sent by the server; optional here because rows computed from the
    /// local store may not carry one.
    let eatenAt: String?
}

/// A recipe or supplement that uses a food as an ingredient.
struct WhereUsedRef: Codable, Identifiable {
    let id: String
    let name: String
    /// Recipes only: the food is the recipe's sole ingredient, so it cannot be removed.
    var isLastIngredient: Bool = false
}

extension WhereUsedRef {
    private enum CodingKeys: String, CodingKey {
        case id, name, isLastIngredient
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        // Absent on supplements and on the delete conflict's `lastIngredientRecipes`.
        isLastIngredient = try container.decodeIfPresent(Bool.self, forKey: .isLastIngredient) ?? false
    }
}

/// Response of `GET /api/recipes/{id}/usage` and `GET /api/foods/{id}/usage`,
/// and the same shape computed from the local store in Local mode: the diary
/// entries (newest first, capped at 200 — `totalEntries` is the full count)
/// and, for a food, the recipes and supplements that use it.
struct WhereUsed: Decodable {
    let entries: [WhereUsedEntry]
    let totalEntries: Int
    let recipes: [WhereUsedRef]
    let supplements: [WhereUsedRef]

    init(
        entries: [WhereUsedEntry],
        totalEntries: Int,
        recipes: [WhereUsedRef] = [],
        supplements: [WhereUsedRef] = []
    ) {
        self.entries = entries
        self.totalEntries = totalEntries
        self.recipes = recipes
        self.supplements = supplements
    }

    private enum CodingKeys: String, CodingKey {
        case entries, totalEntries, recipes, supplements
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        entries = try container.decode([WhereUsedEntry].self, forKey: .entries)
        totalEntries = try container.decode(Int.self, forKey: .totalEntries)
        // The recipe response carries only entries.
        recipes = try container.decodeIfPresent([WhereUsedRef].self, forKey: .recipes) ?? []
        supplements = try container.decodeIfPresent([WhereUsedRef].self, forKey: .supplements) ?? []
    }

    static let entryLimit = 200

    var isEmpty: Bool {
        totalEntries == 0 && recipes.isEmpty && supplements.isEmpty
    }

    /// Newest first, like the server: by day, then by when the entry was eaten.
    static func sortedNewestFirst(_ entries: [WhereUsedEntry]) -> [WhereUsedEntry] {
        entries.sorted { lhs, rhs in
            if lhs.date != rhs.date { return lhs.date > rhs.date }
            return (lhs.eatenAt ?? "") > (rhs.eatenAt ?? "")
        }
    }
}

extension LocalEntry {
    var whereUsedEntry: WhereUsedEntry {
        WhereUsedEntry(id: id, date: date, mealType: mealType, servings: servings, eatenAt: toEntry()?.eatenAt)
    }
}
