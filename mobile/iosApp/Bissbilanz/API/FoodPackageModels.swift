import Foundation

// Wire types for `/api/foods/package/*` and the export filter facets. Hand-written
// like the rest of the iOS client; shapes follow
// `src/lib/server/validation/responses/food-package.ts`.

struct FoodPackageSelection: Encodable, Equatable {
    var all: Bool?
    var foodIds: [String]?
    var recipeIds: [String]?
    var brands: [String]?
    var labels: [String]?
    /// `all`, `related` or `none`.
    var includeRecipes: String?
}

struct FoodPackageSummary: Decodable, Equatable {
    let foods: Int
    let recipes: Int
    let ingredientFoods: Int
    let images: Int
    let estimatedBytes: Int
    let maxBytes: Int
    let overLimit: Bool
}

enum FoodPackageAction: String, Codable, CaseIterable, Identifiable {
    case skip
    case replace
    case keepBoth = "keep_both"

    var id: String { rawValue }
}

struct FoodPackageFoodSummary: Decodable, Equatable {
    let name: String
    let brand: String?
    let servingSize: Double
    let servingUnit: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let barcode: String?
    let labels: [String]
    let imageUrl: String?
}

struct FoodPackageExistingFood: Decodable, Equatable {
    let id: String
    let name: String
    let brand: String?
    let servingSize: Double
    let servingUnit: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let barcode: String?
    let labels: [String]
    let imageUrl: String?
    let entryCount: Int
    let recipeCount: Int

    var summary: FoodPackageFoodSummary {
        FoodPackageFoodSummary(
            name: name, brand: brand, servingSize: servingSize, servingUnit: servingUnit,
            calories: calories, protein: protein, carbs: carbs, fat: fat, fiber: fiber,
            barcode: barcode, labels: labels, imageUrl: imageUrl
        )
    }
}

struct FoodPackageAlsoMatch: Decodable, Equatable {
    let id: String
    let name: String
    let brand: String?
}

struct FoodPackageFoodConflict: Decodable, Equatable, Identifiable {
    let ref: String
    /// `barcode`, `name_brand` or `barcode_and_name`.
    let reason: String
    let incoming: FoodPackageFoodSummary
    let existing: FoodPackageExistingFood
    let alsoMatches: [FoodPackageAlsoMatch]
    let allowed: [FoodPackageAction]
    let notes: [String]
    let targetGroup: String?

    var id: String { ref }
}

struct FoodPackageRecipeSummary: Decodable, Equatable {
    let name: String
    let totalServings: Double
    let cookedWeight: Double?
    let ingredients: [String]
    let imageUrl: String?
}

struct FoodPackageExistingRecipe: Decodable, Equatable {
    let id: String
    let name: String
    let totalServings: Double
    let cookedWeight: Double?
    let ingredients: [String]
    let imageUrl: String?
    let entryCount: Int
}

struct FoodPackageRecipeConflict: Decodable, Equatable, Identifiable {
    let ref: String
    let incoming: FoodPackageRecipeSummary
    let existing: FoodPackageExistingRecipe
    let allowed: [FoodPackageAction]
    let notes: [String]

    var id: String { ref }
}

struct FoodPackageIssue: Decodable, Equatable {
    let ref: String?
    let message: String
}

struct FoodPackageNewFoodRecipe: Decodable, Equatable {
    let ref: String
    let name: String
}

/// A food of the package that is new to the importer — created unless the user
/// maps it onto one of their own foods.
struct FoodPackageNewFoodItem: Decodable, Equatable, Identifiable {
    let ref: String
    /// `selected`, or `ingredient` when it only came along for a recipe.
    let role: String
    let name: String
    let brand: String?
    let servingSize: Double
    let servingUnit: String
    let calories: Double
    /// Recipes of the package that use this food.
    let recipes: [FoodPackageNewFoodRecipe]

    var id: String { ref }
    var isIngredient: Bool { role == "ingredient" }
}

struct FoodPackagePreview: Decodable, Equatable {
    struct Totals: Decodable, Equatable {
        let foods: Int
        let recipes: Int
        let images: Int
    }

    struct NewFoods: Decodable, Equatable {
        let count: Int
        let ingredientOnly: Int
        /// Every food the import would create. Absent on servers that predate it.
        let items: [FoodPackageNewFoodItem]
    }

    struct NewRecipes: Decodable, Equatable {
        let count: Int
    }

    struct Conflicts: Decodable, Equatable {
        let foods: [FoodPackageFoodConflict]
        let recipes: [FoodPackageRecipeConflict]
    }

    let packageHash: String
    let totals: Totals
    let newFoods: NewFoods
    let newRecipes: NewRecipes
    let conflicts: Conflicts
    let issues: [FoodPackageIssue]
}

struct FoodPackageResolution: Encodable, Equatable {
    let ref: String
    let action: FoodPackageAction
    let existingId: String
}

/// A new incoming food replaced by one of the importer's own: not created, and
/// the package's recipes use `foodId` instead.
struct FoodPackageMapping: Encodable, Equatable {
    let ref: String
    let foodId: String
}

struct FoodPackageResolutions: Encodable, Equatable {
    let packageHash: String
    let foods: [FoodPackageResolution]
    let recipes: [FoodPackageResolution]
    var mappings: [FoodPackageMapping] = []

    private enum CodingKeys: String, CodingKey {
        case packageHash, foods, recipes, mappings
    }

    /// `mappings` is left out when empty, so a server that predates it sees the body it always did.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(packageHash, forKey: .packageHash)
        try container.encode(foods, forKey: .foods)
        try container.encode(recipes, forKey: .recipes)
        if !mappings.isEmpty {
            try container.encode(mappings, forKey: .mappings)
        }
    }
}

struct FoodPackageCounts: Decodable, Equatable {
    let foods: Int
    let recipes: Int
}

struct FoodPackageImportResult: Decodable, Equatable {
    let created: FoodPackageCounts
    let replaced: FoodPackageCounts
    let keptBoth: FoodPackageCounts
    let skipped: FoodPackageCounts
    let images: Int
    let issues: [FoodPackageIssue]
}

struct FoodBrandStat: Decodable, Equatable {
    let brand: String
    let count: Int
}

struct FoodBrandsResponse: Decodable {
    let brands: [FoodBrandStat]
}

struct FoodLabelStat: Decodable, Equatable {
    let label: String
    let count: Int
}

struct FoodLabelStatsResponse: Decodable {
    let labels: [FoodLabelStat]
}

/// The user's choice per conflict while reviewing an import. Mirrors the web's
/// `src/lib/components/food-package/foodPackage.ts` and the shared Kotlin
/// `FoodPackageResolutionState`, so every client resolves a package the same way.
enum FoodPackageResolutionModel {
    struct Conflict: Equatable {
        let ref: String
        let existingId: String
        let allowed: [FoodPackageAction]
    }

    /// Skip is the safe default: it never changes what the user already has.
    static func initial(_ conflicts: [Conflict]) -> [String: FoodPackageAction] {
        Dictionary(uniqueKeysWithValues: conflicts.map { ($0.ref, .skip) })
    }

    /// Only one incoming item may replace a given existing item, so choosing
    /// Replace demotes any other Replace on the same target back to Skip.
    static func set(
        _ state: [String: FoodPackageAction],
        conflicts: [Conflict],
        ref: String,
        action: FoodPackageAction
    ) -> [String: FoodPackageAction] {
        guard let conflict = conflicts.first(where: { $0.ref == ref }),
              conflict.allowed.contains(action) else { return state }
        var next = state
        next[ref] = action
        if action == .replace {
            for other in conflicts
                where other.ref != ref && other.existingId == conflict.existingId && next[other.ref] == .replace
            {
                next[other.ref] = .skip
            }
        }
        return next
    }

    /// One action for all; where not allowed (or a second Replace of one item) it falls back to Skip.
    static func applyToAll(_ conflicts: [Conflict], action: FoodPackageAction) -> [String: FoodPackageAction] {
        var replaced = Set<String>()
        var state: [String: FoodPackageAction] = [:]
        for conflict in conflicts {
            var chosen: FoodPackageAction = conflict.allowed.contains(action) ? action : .skip
            if chosen == .replace, !replaced.insert(conflict.existingId).inserted {
                chosen = .skip
            }
            state[conflict.ref] = chosen
        }
        return state
    }

    /// The action every conflict shares, or nil when they differ.
    static func common(_ conflicts: [Conflict], state: [String: FoodPackageAction]) -> FoodPackageAction? {
        let actions = Set(conflicts.map { state[$0.ref] ?? .skip })
        return actions.count == 1 ? actions.first : nil
    }

    /// `mappings` maps a new food's ref to the id of the user's own food standing in for it.
    static func resolutions(
        for preview: FoodPackagePreview,
        foods: [String: FoodPackageAction],
        recipes: [String: FoodPackageAction],
        mappings: [String: String] = [:]
    ) -> FoodPackageResolutions {
        let mapped = preview.newFoods.items.compactMap { item in
            mappings[item.ref].map { FoodPackageMapping(ref: item.ref, foodId: $0) }
        }
        return FoodPackageResolutions(
            packageHash: preview.packageHash,
            foods: preview.conflicts.foods.map {
                FoodPackageResolution(ref: $0.ref, action: foods[$0.ref] ?? .skip, existingId: $0.existing.id)
            },
            recipes: preview.conflicts.recipes.map {
                FoodPackageResolution(ref: $0.ref, action: recipes[$0.ref] ?? .skip, existingId: $0.existing.id)
            },
            mappings: mapped
        )
    }

    /// A food of the user's may stand in for an incoming one when both measure in the
    /// same dimension (mass or volume) — the server rejects a mapping that would make
    /// a recipe's quantity meaningless.
    static func isCompatible(_ item: FoodPackageNewFoodItem, _ food: Food) -> Bool {
        guard let unit = ServingUnit(rawValue: item.servingUnit) else { return false }
        return isSameUnitDimension(unit, food.servingUnit)
    }
}

extension FoodPackageFoodConflict {
    var resolvable: FoodPackageResolutionModel.Conflict {
        .init(ref: ref, existingId: existing.id, allowed: allowed)
    }
}

extension FoodPackageRecipeConflict {
    var resolvable: FoodPackageResolutionModel.Conflict {
        .init(ref: ref, existingId: existing.id, allowed: allowed)
    }
}


extension FoodPackagePreview.NewFoods {
    private enum CodingKeys: String, CodingKey {
        case count, ingredientOnly, items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        count = try container.decode(Int.self, forKey: .count)
        ingredientOnly = try container.decode(Int.self, forKey: .ingredientOnly)
        items = try container.decodeIfPresent([FoodPackageNewFoodItem].self, forKey: .items) ?? []
    }
}
