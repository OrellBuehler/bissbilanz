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

struct FoodPackagePreview: Decodable, Equatable {
    struct Totals: Decodable, Equatable {
        let foods: Int
        let recipes: Int
        let images: Int
    }

    struct NewFoods: Decodable, Equatable {
        let count: Int
        let ingredientOnly: Int
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

struct FoodPackageResolutions: Encodable, Equatable {
    let packageHash: String
    let foods: [FoodPackageResolution]
    let recipes: [FoodPackageResolution]
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

struct FoodLabelStat: Decodable, Equatable {
    let label: String
    let count: Int
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

    static func resolutions(
        for preview: FoodPackagePreview,
        foods: [String: FoodPackageAction],
        recipes: [String: FoodPackageAction]
    ) -> FoodPackageResolutions {
        FoodPackageResolutions(
            packageHash: preview.packageHash,
            foods: preview.conflicts.foods.map {
                FoodPackageResolution(ref: $0.ref, action: foods[$0.ref] ?? .skip, existingId: $0.existing.id)
            },
            recipes: preview.conflicts.recipes.map {
                FoodPackageResolution(ref: $0.ref, action: recipes[$0.ref] ?? .skip, existingId: $0.existing.id)
            }
        )
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
