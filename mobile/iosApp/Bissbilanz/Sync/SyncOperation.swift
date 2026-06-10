import Foundation

/// One queued offline write, mirroring the Android `SyncOperation` hierarchy.
/// Creates carry the optimistic `temp_` row id (`localId`) so the drained
/// server record can replace the local row, and so edits/deletes of a not-yet-
/// uploaded row can coalesce with (or cancel) the queued create.
enum SyncOperation: Codable {
    case createFood(body: FoodCreate, localId: String)
    case updateFood(id: String, body: FoodCreate)
    case deleteFood(id: String)
    case toggleFavorite(id: String, isFavorite: Bool)
    case createEntry(body: EntryCreate, localId: String)
    case updateEntry(id: String, body: EntryUpdate)
    case deleteEntry(id: String)
    case createRecipe(body: RecipeCreate, localId: String)
    case updateRecipe(id: String, body: RecipeUpdate)
    case deleteRecipe(id: String)
    case setGoals(body: Goals)
    case createWeight(body: WeightCreate, localId: String)
    case updateWeight(id: String, body: WeightUpdate)
    case deleteWeight(id: String)
    case createSupplement(body: SupplementCreate, localId: String)
    case updateSupplement(id: String, body: SupplementUpdate)
    case deleteSupplement(id: String)
    case logSupplement(supplementId: String, date: String)
    case unlogSupplement(supplementId: String, date: String)
    case setDayProperties(date: String, isFastingDay: Bool)
    case deleteDayProperties(date: String)
    case updatePreferences(body: PreferencesUpdate)

    /// Stable discriminator stored on the queue row (debugging/inspection).
    var typeName: String {
        switch self {
        case .createFood: "create_food"
        case .updateFood: "update_food"
        case .deleteFood: "delete_food"
        case .toggleFavorite: "toggle_favorite"
        case .createEntry: "create_entry"
        case .updateEntry: "update_entry"
        case .deleteEntry: "delete_entry"
        case .createRecipe: "create_recipe"
        case .updateRecipe: "update_recipe"
        case .deleteRecipe: "delete_recipe"
        case .setGoals: "set_goals"
        case .createWeight: "create_weight"
        case .updateWeight: "update_weight"
        case .deleteWeight: "delete_weight"
        case .createSupplement: "create_supplement"
        case .updateSupplement: "update_supplement"
        case .deleteSupplement: "delete_supplement"
        case .logSupplement: "log_supplement"
        case .unlogSupplement: "unlog_supplement"
        case .setDayProperties: "set_day_properties"
        case .deleteDayProperties: "delete_day_properties"
        case .updatePreferences: "update_preferences"
        }
    }

    var affectedTable: String? {
        switch self {
        case .createFood, .updateFood, .deleteFood, .toggleFavorite: "foods"
        case .createEntry, .updateEntry, .deleteEntry: "entries"
        case .createRecipe, .updateRecipe, .deleteRecipe: "recipes"
        case .setGoals: "goals"
        case .createWeight, .updateWeight, .deleteWeight: "weight"
        case .createSupplement, .updateSupplement, .deleteSupplement,
             .logSupplement, .unlogSupplement: "supplements"
        case .setDayProperties, .deleteDayProperties: "day_properties"
        case .updatePreferences: "preferences"
        }
    }

    var affectedId: String? {
        switch self {
        case let .createFood(_, localId), let .createEntry(_, localId),
             let .createRecipe(_, localId), let .createWeight(_, localId),
             let .createSupplement(_, localId):
            localId
        case let .updateFood(id, _), let .deleteFood(id), let .toggleFavorite(id, _),
             let .updateEntry(id, _), let .deleteEntry(id),
             let .updateRecipe(id, _), let .deleteRecipe(id),
             let .updateWeight(id, _), let .deleteWeight(id),
             let .updateSupplement(id, _), let .deleteSupplement(id):
            id
        case let .logSupplement(supplementId, _), let .unlogSupplement(supplementId, _):
            supplementId
        case let .setDayProperties(date, _), let .deleteDayProperties(date):
            date
        case .setGoals, .updatePreferences:
            nil
        }
    }

    /// Human-readable summary used in sync error messages (Android parity).
    var summary: String {
        switch self {
        case .createFood: "create food"
        case let .updateFood(id, _): "update food \(id)"
        case let .deleteFood(id): "delete food \(id)"
        case let .toggleFavorite(id, _): "toggle favorite \(id)"
        case .createEntry: "create entry"
        case let .updateEntry(id, _): "update entry \(id)"
        case let .deleteEntry(id): "delete entry \(id)"
        case .createRecipe: "create recipe"
        case let .updateRecipe(id, _): "update recipe \(id)"
        case let .deleteRecipe(id): "delete recipe \(id)"
        case .setGoals: "set goals"
        case .createWeight: "create weight entry"
        case let .updateWeight(id, _): "update weight entry \(id)"
        case let .deleteWeight(id): "delete weight entry \(id)"
        case .createSupplement: "create supplement"
        case let .updateSupplement(id, _): "update supplement \(id)"
        case let .deleteSupplement(id): "delete supplement \(id)"
        case let .logSupplement(id, _): "log supplement \(id)"
        case let .unlogSupplement(id, _): "unlog supplement \(id)"
        case let .setDayProperties(date, _): "set day properties \(date)"
        case let .deleteDayProperties(date): "delete day properties \(date)"
        case .updatePreferences: "update preferences"
        }
    }
}
