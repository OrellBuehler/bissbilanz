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
    /// Attaches or, with a nil `imageUrl`, removes a food's image.
    case setFoodImage(id: String, imageUrl: String?)
    /// Replaces the user's labels for a food. Labels live in their own table
    /// server-side and never ride on a food body, so this is its own operation.
    case setFoodLabels(id: String, labels: [String])
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
    case createSleep(body: SleepCreate, localId: String)
    case updateSleep(id: String, body: SleepUpdate)
    case deleteSleep(id: String)
    case createSupplement(body: SupplementCreate, localId: String)
    case updateSupplement(id: String, body: SupplementUpdate)
    case deleteSupplement(id: String)
    case logSupplement(supplementId: String, date: String)
    case unlogSupplement(supplementId: String, date: String)
    case setDayProperties(date: String, isFastingDay: Bool)
    case deleteDayProperties(date: String)
    /// Uploads a finished fast. Keyed by the client UUID (see
    /// `FastingSession.upsertBody`), so no temp-id remap is involved.
    case upsertFast(id: String, body: FastingSessionUpsert)
    case deleteFast(id: String)
    case updatePreferences(body: PreferencesUpdate)

    /// Stable discriminator stored on the queue row (debugging/inspection).
    var typeName: String {
        switch self {
        case .createFood: "create_food"
        case .updateFood: "update_food"
        case .deleteFood: "delete_food"
        case .toggleFavorite: "toggle_favorite"
        case .setFoodImage: "set_food_image"
        case .setFoodLabels: "set_food_labels"
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
        case .createSleep: "create_sleep"
        case .updateSleep: "update_sleep"
        case .deleteSleep: "delete_sleep"
        case .createSupplement: "create_supplement"
        case .updateSupplement: "update_supplement"
        case .deleteSupplement: "delete_supplement"
        case .logSupplement: "log_supplement"
        case .unlogSupplement: "unlog_supplement"
        case .setDayProperties: "set_day_properties"
        case .deleteDayProperties: "delete_day_properties"
        case .upsertFast: "upsert_fast"
        case .deleteFast: "delete_fast"
        case .updatePreferences: "update_preferences"
        }
    }

    var affectedTable: String? {
        switch self {
        case .createFood, .updateFood, .deleteFood, .toggleFavorite, .setFoodImage, .setFoodLabels: "foods"
        case .createEntry, .updateEntry, .deleteEntry: "entries"
        case .createRecipe, .updateRecipe, .deleteRecipe: "recipes"
        case .setGoals: "goals"
        case .createWeight, .updateWeight, .deleteWeight: "weight"
        case .createSleep, .updateSleep, .deleteSleep: "sleep"
        case .createSupplement, .updateSupplement, .deleteSupplement,
             .logSupplement, .unlogSupplement: "supplements"
        case .setDayProperties, .deleteDayProperties: "day_properties"
        case .upsertFast, .deleteFast: "fasts"
        case .updatePreferences: "preferences"
        }
    }

    var affectedId: String? {
        switch self {
        case let .createFood(_, localId), let .createEntry(_, localId),
             let .createRecipe(_, localId), let .createWeight(_, localId),
             let .createSleep(_, localId), let .createSupplement(_, localId):
            localId
        case let .updateFood(id, _), let .deleteFood(id), let .toggleFavorite(id, _),
             let .setFoodImage(id, _), let .setFoodLabels(id, _),
             let .updateEntry(id, _), let .deleteEntry(id),
             let .updateRecipe(id, _), let .deleteRecipe(id),
             let .updateWeight(id, _), let .deleteWeight(id),
             let .updateSleep(id, _), let .deleteSleep(id),
             let .updateSupplement(id, _), let .deleteSupplement(id),
             let .upsertFast(id, _), let .deleteFast(id):
            id
        case let .logSupplement(supplementId, _), let .unlogSupplement(supplementId, _):
            supplementId
        case let .setDayProperties(date, _), let .deleteDayProperties(date):
            date
        case .setGoals, .updatePreferences:
            nil
        }
    }

    /// Returns a copy with every reference to `oldId` rewritten to `newId`,
    /// or nil when the operation does not reference it. Used by the sync
    /// manager after a queued create drains: later queued operations may
    /// reference the resolved `temp_` id (an entry logging a temp food, a
    /// recipe ingredient, a queued supplement log, or an update/delete keyed
    /// by the temp id) and must upload with the server id instead.
    func remappingReferences(from oldId: String, to newId: String) -> SyncOperation? {
        guard oldId != newId else { return nil }
        switch self {
        case let .updateFood(id, body) where id == oldId:
            return .updateFood(id: newId, body: body)

        case let .deleteFood(id) where id == oldId:
            return .deleteFood(id: newId)

        case let .toggleFavorite(id, isFavorite) where id == oldId:
            return .toggleFavorite(id: newId, isFavorite: isFavorite)

        case let .setFoodImage(id, imageUrl) where id == oldId:
            return .setFoodImage(id: newId, imageUrl: imageUrl)

        case let .setFoodLabels(id, labels) where id == oldId:
            return .setFoodLabels(id: newId, labels: labels)

        case let .createEntry(body, localId) where body.foodId == oldId || body.recipeId == oldId:
            var patched = body
            if patched.foodId == oldId { patched.foodId = newId }
            if patched.recipeId == oldId { patched.recipeId = newId }
            return .createEntry(body: patched, localId: localId)

        case let .updateEntry(id, body) where id == oldId:
            return .updateEntry(id: newId, body: body)

        case let .deleteEntry(id) where id == oldId:
            return .deleteEntry(id: newId)

        case let .createRecipe(body, localId):
            guard let ingredients = Self.remapRecipeIngredients(body.ingredients, from: oldId, to: newId) else {
                return nil
            }
            let patched = RecipeCreate(
                name: body.name,
                totalServings: body.totalServings,
                ingredients: ingredients,
                isFavorite: body.isFavorite,
                imageUrl: body.imageUrl
            )
            return .createRecipe(body: patched, localId: localId)

        case let .updateRecipe(id, body):
            let ingredients = body.ingredients.flatMap {
                Self.remapRecipeIngredients($0, from: oldId, to: newId)
            }
            guard id == oldId || ingredients != nil else { return nil }
            var patched = body
            if let ingredients { patched.ingredients = ingredients }
            return .updateRecipe(id: id == oldId ? newId : id, body: patched)

        case let .deleteRecipe(id) where id == oldId:
            return .deleteRecipe(id: newId)

        case let .updateWeight(id, body) where id == oldId:
            return .updateWeight(id: newId, body: body)

        case let .deleteWeight(id) where id == oldId:
            return .deleteWeight(id: newId)

        case let .updateSleep(id, body) where id == oldId:
            return .updateSleep(id: newId, body: body)

        case let .deleteSleep(id) where id == oldId:
            return .deleteSleep(id: newId)

        case let .createSupplement(body, localId):
            guard let ingredients = Self.remapSupplementIngredients(body.ingredients, from: oldId, to: newId)
            else { return nil }
            let patched = SupplementCreate(
                name: body.name,
                scheduleType: body.scheduleType,
                scheduleDays: body.scheduleDays,
                scheduleStartDate: body.scheduleStartDate,
                isActive: body.isActive,
                sortOrder: body.sortOrder,
                timeOfDay: body.timeOfDay,
                ingredients: ingredients
            )
            return .createSupplement(body: patched, localId: localId)

        case let .updateSupplement(id, body):
            let ingredients = body.ingredients.flatMap {
                Self.remapSupplementIngredients($0, from: oldId, to: newId)
            }
            guard id == oldId || ingredients != nil else { return nil }
            var patched = body
            if let ingredients { patched.ingredients = ingredients }
            return .updateSupplement(id: id == oldId ? newId : id, body: patched)

        case let .deleteSupplement(id) where id == oldId:
            return .deleteSupplement(id: newId)

        case let .logSupplement(supplementId, date) where supplementId == oldId:
            return .logSupplement(supplementId: newId, date: date)

        case let .unlogSupplement(supplementId, date) where supplementId == oldId:
            return .unlogSupplement(supplementId: newId, date: date)

        default:
            return nil
        }
    }

    /// Rewritten ingredient list, or nil when nothing referenced the old id.
    private static func remapRecipeIngredients(
        _ ingredients: [RecipeIngredientInput],
        from oldId: String,
        to newId: String
    ) -> [RecipeIngredientInput]? {
        guard ingredients.contains(where: { $0.foodId == oldId }) else { return nil }
        return ingredients.map { input in
            guard input.foodId == oldId else { return input }
            return RecipeIngredientInput(foodId: newId, quantity: input.quantity, servingUnit: input.servingUnit)
        }
    }

    private static func remapSupplementIngredients(
        _ ingredients: [SupplementIngredientInput],
        from oldId: String,
        to newId: String
    ) -> [SupplementIngredientInput]? {
        guard ingredients.contains(where: { $0.foodId == oldId }) else { return nil }
        return ingredients.map { input in
            guard input.foodId == oldId else { return input }
            var patched = input
            patched.foodId = newId
            return patched
        }
    }

    /// Human-readable summary used in sync error messages (Android parity).
    var summary: String {
        switch self {
        case .createFood: "create food"
        case let .updateFood(id, _): "update food \(id)"
        case let .deleteFood(id): "delete food \(id)"
        case let .toggleFavorite(id, _): "toggle favorite \(id)"
        case let .setFoodImage(id, _): "set food image \(id)"
        case let .setFoodLabels(id, _): "set food labels \(id)"
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
        case .createSleep: "create sleep entry"
        case let .updateSleep(id, _): "update sleep entry \(id)"
        case let .deleteSleep(id): "delete sleep entry \(id)"
        case .createSupplement: "create supplement"
        case let .updateSupplement(id, _): "update supplement \(id)"
        case let .deleteSupplement(id): "delete supplement \(id)"
        case let .logSupplement(id, _): "log supplement \(id)"
        case let .unlogSupplement(id, _): "unlog supplement \(id)"
        case let .setDayProperties(date, _): "set day properties \(date)"
        case let .deleteDayProperties(date): "delete day properties \(date)"
        case let .upsertFast(id, _): "upsert fast \(id)"
        case let .deleteFast(id): "delete fast \(id)"
        case .updatePreferences: "update preferences"
        }
    }
}
