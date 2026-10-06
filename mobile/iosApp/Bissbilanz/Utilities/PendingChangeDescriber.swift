import Foundation

/// One labelled value in the details sheet. `oldValue` is set when the value
/// was compared against a local record (old → new).
struct PendingChangeField: Equatable, Identifiable {
    let label: String
    let value: String
    var oldValue: String?
    var isExtended = false

    var id: String { label }
}

struct PendingChangeSection: Equatable, Identifiable {
    let title: String?
    let fields: [PendingChangeField]

    var id: String { title ?? "" }
}

enum PendingChangeKind: Equatable {
    case create
    case update
    case delete
    case other
}

/// What a queued change is about, in list-row form: the generic operation
/// `title` ("Logged food"), the `subject` it targets ("Coke Zero") and a few
/// short `extras` ("1 serving", "Dinner").
struct PendingChangeSummary: Equatable {
    let title: String
    let subject: String?
    let extras: [String]

    /// First line of a list row: the subject when known, else the generic title.
    var primary: String { subject ?? title }

    /// Second line of a list row: the generic title (when the subject took the
    /// first line) followed by the extras.
    var secondary: String? {
        let parts = (subject == nil ? [] : [title]) + extras
        return parts.isEmpty ? nil : parts.joined(separator: " \u{00B7} ")
    }
}

struct PendingChangeDetails: Equatable {
    let kind: PendingChangeKind
    let summary: PendingChangeSummary
    let sections: [PendingChangeSection]
    let notes: [String]

    /// Confirmation text for discarding: says what is lost.
    var discardMessage: String {
        discardMessage(dependents: 0)
    }

    /// `dependents` is how many other queued changes wait on this create.
    func discardMessage(dependents: Int) -> String {
        let name = summary.subject ?? summary.title
        let base = switch kind {
        case .create: L10n.pendingDiscardCreate(name)
        case .update: L10n.pendingDiscardUpdate(name)
        case .delete: L10n.pendingDiscardDelete(name)
        case .other: L10n.pendingDiscardOther(name)
        }
        guard dependents > 0 else { return base }
        return "\(base)\n\n\(L10n.pendingDiscardDependents(dependents))"
    }
}

/// Resolves ids to names and cached records without touching SwiftData, so the
/// describer stays a pure function. `PendingSyncView` backs the closures with
/// the local store; tests back them with fixtures.
struct PendingChangeLookup {
    var food: (String) -> Food? = { _ in nil }
    var recipe: (String) -> Recipe? = { _ in nil }
    var entry: (String) -> Entry? = { _ in nil }
    /// `temp_` id to server id (see `TempIdMap`).
    var resolveId: (String) -> String = { $0 }
    /// Names carried by queued creates, keyed by their `temp_` id: the local
    /// row is gone when a create already drained or was rolled back.
    var queuedNames: [String: String] = [:]

    func foodName(_ id: String) -> String? {
        let resolved = resolveId(id)
        return food(resolved)?.name ?? queuedNames[id] ?? queuedNames[resolved]
    }

    func recipeName(_ id: String) -> String? {
        let resolved = resolveId(id)
        return recipe(resolved)?.name ?? queuedNames[id] ?? queuedNames[resolved]
    }

    /// Names of the foods and recipes the given queued creates will upload.
    static func names(of operations: [SyncOperation]) -> [String: String] {
        var names: [String: String] = [:]
        for operation in operations {
            switch operation {
            case let .createFood(body, localId): names[localId] = body.name
            case let .createRecipe(body, localId): names[localId] = body.name
            default: break
            }
        }
        return names
    }
}

enum PendingChangeDescriber {
    static func summary(
        type: String,
        operation: SyncOperation?,
        lookup: PendingChangeLookup,
        before: PendingChangeBefore? = nil
    ) -> PendingChangeSummary {
        details(type: type, operation: operation, lookup: lookup, before: before).summary
    }

    // swiftlint:disable:next cyclomatic_complexity function_body_length
    static func details(
        type: String,
        operation: SyncOperation?,
        lookup: PendingChangeLookup,
        before: PendingChangeBefore? = nil
    ) -> PendingChangeDetails {
        let title = L10n.pendingChangeTitle(forType: type)
        guard let operation else {
            return PendingChangeDetails(
                kind: kind(forType: type),
                summary: PendingChangeSummary(title: title, subject: nil, extras: []),
                sections: [],
                notes: []
            )
        }
        switch operation {
        case let .createFood(body, _):
            return foodCreate(body, title: title)
        case let .updateFood(id, body):
            return foodUpdate(id: id, body: body, title: title, lookup: lookup, before: before?.food)
        case let .deleteFood(id, force):
            let name = lookup.foodName(id)
            return deletion(
                title: title, subject: name, label: L10n.pendingDetailFood, id: id,
                notes: force ? [L10n.pendingDetailForced] : []
            )
        case let .toggleFavorite(id, isFavorite):
            let favorite = field(L10n.favorite, isFavorite ? L10n.pendingDetailYes : L10n.pendingDetailNo)
            return simple(.update, title: title, subject: lookup.foodName(id), fields: [favorite])
        case let .setFoodImage(id, imageUrl):
            let photo = field(L10n.pendingDetailPhoto, photoText(imageUrl))
            return simple(.update, title: title, subject: lookup.foodName(id), fields: [photo])
        case let .setFoodLabels(id, labels), let .addGeneratedFoodLabels(id, labels):
            let value = labels.isEmpty ? emptyDash : labels.joined(separator: ", ")
            return simple(
                .update, title: title, subject: lookup.foodName(id),
                fields: [field(L10n.pendingDetailLabels, value)]
            )
        case let .createEntry(body, _):
            return entryCreate(body, title: title, lookup: lookup)
        case let .updateEntry(id, body):
            return entryUpdate(id: id, body: body, title: title, lookup: lookup, before: before?.entry)
        case let .deleteEntry(id):
            return entryDelete(id: id, title: title, lookup: lookup)
        case let .createRecipe(body, _):
            return recipeCreate(body, title: title, lookup: lookup)
        case let .updateRecipe(id, body):
            return recipeUpdate(id: id, body: body, title: title, lookup: lookup, before: before?.recipe)
        case let .setRecipeImage(id, imageUrl):
            let photo = field(L10n.pendingDetailPhoto, photoText(imageUrl))
            return simple(.update, title: title, subject: lookup.recipeName(id), fields: [photo])
        case let .setRecipeLabels(id, labels), let .addGeneratedRecipeLabels(id, labels):
            let value = labels.isEmpty ? emptyDash : labels.joined(separator: ", ")
            return simple(
                .update, title: title, subject: lookup.recipeName(id),
                fields: [field(L10n.pendingDetailLabels, value)]
            )
        case let .deleteRecipe(id, force):
            return deletion(
                title: title, subject: lookup.recipeName(id), label: L10n.pendingDetailRecipe, id: id,
                notes: force ? [L10n.pendingDetailForced] : []
            )
        case let .logSupplement(supplementId, date), let .unlogSupplement(supplementId, date):
            let isLog: Bool = if case .logSupplement = operation { true } else { false }
            return simple(
                isLog ? .other : .delete, title: title, subject: nil,
                fields: [field(L10n.date, dateText(date)), field(L10n.pendingDetailReference, supplementId)],
                extras: [dateText(date)]
            )
        case let .deleteDayProperties(date):
            return simple(
                .delete, title: title, subject: nil,
                fields: [field(L10n.date, dateText(date))], extras: [dateText(date)]
            )
        case let .setDayProperties(date, patch):
            var fields = [field(L10n.date, dateText(date))]
            fields += genericFields(of: patch)
            return simple(.update, title: title, subject: nil, fields: fields, extras: [dateText(date)])
        case let .deleteWeight(id), let .deleteSleep(id), let .deleteSupplement(id),
             let .deleteReminder(id), let .deleteFast(id):
            return deletion(title: title, subject: nil, label: nil, id: id, notes: [])
        case let .createWeight(body, _):
            return generic(
                kind: .create, title: title, value: body,
                extras: [amount(body.weightKg, "kg"), dateText(body.entryDate)]
            )
        case let .completeAiTask(taskId, localEntryIds, resultSummary, _, _):
            var fields: [PendingChangeField] = []
            if !resultSummary.isEmpty { fields.append(field(L10n.pendingDetailSummary, resultSummary)) }
            fields.append(field(L10n.pendingDetailEntries, "\(localEntryIds.count)"))
            fields.append(field(L10n.pendingDetailReference, taskId))
            return simple(.other, title: title, subject: nil, fields: fields)
        case let .setGoals(body): return generic(kind: .update, title: title, value: body)
        case let .updatePreferences(body): return generic(kind: .update, title: title, value: body)
        case let .updateWeight(_, body): return generic(kind: .update, title: title, value: body)
        case let .createSleep(body, _): return generic(kind: .create, title: title, value: body)
        case let .updateSleep(_, body): return generic(kind: .update, title: title, value: body)
        case let .createSupplement(body, _): return generic(kind: .create, title: title, value: body)
        case let .updateSupplement(_, body): return generic(kind: .update, title: title, value: body)
        case let .createReminder(body, _): return generic(kind: .create, title: title, value: body)
        case let .updateReminder(_, body): return generic(kind: .update, title: title, value: body)
        case let .upsertFast(_, body): return generic(kind: .update, title: title, value: body)
        }
    }

    /// Kind of change a stored `typeName` stands for.
    static func kind(forType type: String) -> PendingChangeKind {
        if type.hasPrefix("create_") { return .create }
        if type.hasPrefix("delete_") || type.hasPrefix("unlog_") { return .delete }
        let updatePrefixes = ["update_", "set_", "toggle_", "upsert_", "add_"]
        if updatePrefixes.contains(where: { type.hasPrefix($0) }) { return .update }
        return .other
    }

    /// SF Symbol per queued op kind (matches the entity, not the action).
    static func icon(forType type: String) -> String {
        switch type {
        case "create_food", "update_food", "delete_food", "toggle_favorite", "set_food_image",
             "set_food_labels", "add_generated_food_labels": "fork.knife"
        case "create_entry", "update_entry", "delete_entry": "plus.circle"
        case "create_recipe", "update_recipe", "delete_recipe", "set_recipe_image",
             "set_recipe_labels", "add_generated_recipe_labels": "book"
        case "set_goals": "target"
        case "create_weight", "update_weight", "delete_weight": "scalemass"
        case "create_sleep", "update_sleep", "delete_sleep": "bed.double"
        case "create_supplement", "update_supplement", "delete_supplement",
             "log_supplement", "unlog_supplement": "pills"
        case "set_day_properties", "delete_day_properties": "calendar"
        case "upsert_fast", "delete_fast": "timer"
        case "update_preferences": "gearshape"
        default: "arrow.triangle.2.circlepath"
        }
    }

    // MARK: - Foods

    private static func foodCreate(_ body: FoodCreate, title: String) -> PendingChangeDetails {
        let new = dictionary(of: body)
        let fields = compare(foodSpecs, new: new, old: nil)
        var extras: [String] = []
        if let brand = body.brand, !brand.isEmpty { extras.append(brand) }
        extras.append(amount(body.servingSize, body.servingUnit.displayName))
        extras.append(amount(body.calories, "kcal"))
        return PendingChangeDetails(
            kind: .create,
            summary: PendingChangeSummary(title: title, subject: body.name, extras: extras),
            sections: [PendingChangeSection(title: L10n.pendingDetailCreatedWith, fields: compacted(fields))],
            notes: []
        )
    }

    private static func foodUpdate(
        id: String,
        body: FoodCreate,
        title: String,
        lookup: PendingChangeLookup,
        before: Food?
    ) -> PendingChangeDetails {
        let record = before ?? lookup.food(lookup.resolveId(id))
        let fields = compare(foodSpecs, new: dictionary(of: body), old: record.map { dictionary(of: $0) })
        let outcome = updateOutcome(fields, hasRecord: record != nil, isBefore: before != nil)
        var extras = changedLabels(outcome.changed)
        if extras.isEmpty {
            extras = [amount(body.servingSize, body.servingUnit.displayName), amount(body.calories, "kcal")]
        }
        return PendingChangeDetails(
            kind: .update,
            summary: PendingChangeSummary(
                title: title, subject: record?.name ?? lookup.foodName(id) ?? body.name, extras: extras
            ),
            sections: outcome.sections,
            notes: outcome.notes
        )
    }

    private static var foodSpecs: [FieldSpec] {
        var specs = [
            FieldSpec(key: "name", label: L10n.name, kind: .text),
            FieldSpec(key: "brand", label: L10n.brand, kind: .text),
            FieldSpec(key: "servingSize", label: L10n.servingSize, kind: .serving),
            FieldSpec(key: "calories", label: L10n.calories, kind: .number("kcal")),
            FieldSpec(key: "protein", label: L10n.protein, kind: .number("g")),
            FieldSpec(key: "carbs", label: L10n.carbs, kind: .number("g")),
            FieldSpec(key: "fat", label: L10n.fat, kind: .number("g")),
            FieldSpec(key: "fiber", label: L10n.fiber, kind: .number("g")),
            FieldSpec(key: "barcode", label: L10n.barcode, kind: .text),
            FieldSpec(key: "isFavorite", label: L10n.favorite, kind: .bool),
            FieldSpec(key: "nutriScore", label: L10n.pendingDetailNutriScore, kind: .text),
            FieldSpec(key: "novaGroup", label: L10n.pendingDetailNova, kind: .number("")),
            FieldSpec(key: "additives", label: L10n.pendingDetailAdditives, kind: .list),
            FieldSpec(key: "ingredientsText", label: L10n.pendingDetailIngredientsText, kind: .text),
            FieldSpec(key: "imageUrl", label: L10n.pendingDetailPhoto, kind: .photo),
        ]
        for nutrient in NutrientCatalog.all {
            specs.append(FieldSpec(
                key: nutrient.key, label: nutrient.label, kind: .number(nutrient.unit), isExtended: true
            ))
        }
        return specs
    }

    // MARK: - Entries

    private static func entryCreate(
        _ body: EntryCreate,
        title: String,
        lookup: PendingChangeLookup
    ) -> PendingChangeDetails {
        let food = body.foodId.flatMap { lookup.food(lookup.resolveId($0)) }
        let foodName = body.foodId.flatMap { lookup.foodName($0) }
        let recipeName = body.recipeId.flatMap { lookup.recipeName($0) }
        let quickName = nonEmpty(body.quickName)
        let subject = foodName ?? recipeName ?? quickName

        var fields: [PendingChangeField] = []
        if body.foodId != nil {
            fields.append(field(L10n.pendingDetailFood, foodName ?? L10n.pendingDetailUnknownFood))
        } else if body.recipeId != nil {
            fields.append(field(L10n.pendingDetailRecipe, recipeName ?? emptyDash))
        } else if let quickName {
            fields.append(field(L10n.quickEntry, quickName))
        }
        let specs = entrySpecs.filter { $0.key != "quickName" }
        let values = compare(specs, new: dictionary(of: body), old: nil)
        if let servings = values.first(where: { $0.label == L10n.servings }) {
            fields.append(servings)
            if let food {
                fields.append(field(L10n.servingSize, amount(food.servingSize, food.servingUnit.displayName)))
            }
            fields += values.filter { $0.label != L10n.servings }
        } else {
            fields += values
        }

        let extras = [servingsText(body.servings), L10n.mealName(body.mealType)]
        return PendingChangeDetails(
            kind: .create,
            summary: PendingChangeSummary(title: title, subject: subject, extras: extras),
            sections: [PendingChangeSection(title: L10n.pendingDetailCreatedWith, fields: fields)],
            notes: []
        )
    }

    private static func entryUpdate(
        id: String,
        body: EntryUpdate,
        title: String,
        lookup: PendingChangeLookup,
        before: Entry?
    ) -> PendingChangeDetails {
        let record = before ?? lookup.entry(lookup.resolveId(id))
        let fields = compare(
            entrySpecs, new: dictionary(of: body), old: record.map { dictionary(of: $0) }
        )
        let outcome = updateOutcome(fields, hasRecord: record != nil, isBefore: before != nil)
        let extras = changedLabels(outcome.changed.isEmpty ? fields : outcome.changed)
        var subject = nonEmpty(record?.foodName) ?? nonEmpty(record?.quickName)
        if subject == nil, case let .some(.some(name)) = body.quickName { subject = nonEmpty(name) }
        if subject == nil, let foodId = record?.foodId { subject = lookup.foodName(foodId) }
        return PendingChangeDetails(
            kind: .update,
            summary: PendingChangeSummary(title: title, subject: subject, extras: extras),
            sections: outcome.sections,
            notes: outcome.notes
        )
    }

    private static func entryDelete(
        id: String,
        title: String,
        lookup: PendingChangeLookup
    ) -> PendingChangeDetails {
        guard let record = lookup.entry(lookup.resolveId(id)) else {
            return deletion(title: title, subject: nil, label: nil, id: id, notes: [])
        }
        let name = nonEmpty(record.foodName) ?? nonEmpty(record.quickName)
        var fields: [PendingChangeField] = []
        if let name { fields.append(field(L10n.pendingDetailFood, name)) }
        fields.append(field(L10n.servings, servingsText(record.servings)))
        fields.append(field(L10n.meal, L10n.mealName(record.mealType)))
        if let date = record.date { fields.append(field(L10n.date, dateText(date))) }
        return PendingChangeDetails(
            kind: .delete,
            summary: PendingChangeSummary(
                title: title, subject: name,
                extras: [servingsText(record.servings), L10n.mealName(record.mealType)]
            ),
            sections: [PendingChangeSection(title: L10n.pendingDetailWillDelete, fields: fields)],
            notes: []
        )
    }

    private static var entrySpecs: [FieldSpec] { [
        FieldSpec(key: "quickName", label: L10n.name, kind: .text),
        FieldSpec(key: "servings", label: L10n.servings, kind: .servings),
        FieldSpec(key: "mealType", label: L10n.meal, kind: .meal),
        FieldSpec(key: "date", label: L10n.date, kind: .date),
        FieldSpec(key: "eatenAt", label: L10n.time, kind: .time),
        FieldSpec(key: "notes", label: L10n.notes, kind: .text),
        FieldSpec(key: "quickCalories", label: L10n.calories, kind: .number("kcal")),
        FieldSpec(key: "quickProtein", label: L10n.protein, kind: .number("g")),
        FieldSpec(key: "quickCarbs", label: L10n.carbs, kind: .number("g")),
        FieldSpec(key: "quickFat", label: L10n.fat, kind: .number("g")),
        FieldSpec(key: "quickFiber", label: L10n.fiber, kind: .number("g")),
        FieldSpec(key: "quickNutrients", label: L10n.pendingDetailOtherNutrients, kind: .nutrients),
    ] }

    // MARK: - Recipes

    /// A recipe flattened to display strings, so a create body, an update body
    /// and a cached record compare the same way. Nil means "not submitted".
    private struct RecipeFacts {
        var name: String?
        var servings: String?
        var cookedWeight: String?
        var favorite: String?
        var photo: String?
        var ingredients: String?
        var steps: String?
        var ingredientCount: Int?
    }

    private static func recipeCreate(
        _ body: RecipeCreate,
        title: String,
        lookup: PendingChangeLookup
    ) -> PendingChangeDetails {
        let facts = RecipeFacts(
            name: body.name,
            servings: MacroFormat.servings(body.totalServings),
            cookedWeight: body.cookedWeight.map { amount($0, "g") },
            favorite: body.isFavorite.map { $0 ? L10n.pendingDetailYes : L10n.pendingDetailNo },
            photo: body.imageUrl.map { photoText($0) },
            ingredients: ingredientLines(body.ingredients.map { ($0.foodId, $0.quantity, $0.servingUnit) }, lookup),
            steps: body.steps.map { stepLines($0.map(\.text)) },
            ingredientCount: body.ingredients.count
        )
        let extras = [
            L10n.pendingServingsCount(MacroFormat.servings(body.totalServings), plural: body.totalServings != 1),
            L10n.pendingIngredientCount(body.ingredients.count),
        ]
        return PendingChangeDetails(
            kind: .create,
            summary: PendingChangeSummary(title: title, subject: body.name, extras: extras),
            sections: [PendingChangeSection(
                title: L10n.pendingDetailCreatedWith, fields: recipeFields(new: facts, old: nil)
            )],
            notes: []
        )
    }

    private static func recipeUpdate(
        id: String,
        body: RecipeUpdate,
        title: String,
        lookup: PendingChangeLookup,
        before: Recipe?
    ) -> PendingChangeDetails {
        var facts = RecipeFacts()
        facts.name = body.name
        facts.servings = body.totalServings.map { MacroFormat.servings($0) }
        if let cookedWeight = body.cookedWeight {
            facts.cookedWeight = cookedWeight.map { amount($0, "g") } ?? L10n.pendingDetailCleared
        }
        facts.favorite = body.isFavorite.map { $0 ? L10n.pendingDetailYes : L10n.pendingDetailNo }
        facts.photo = body.imageUrl.map { photoText($0) }
        facts.ingredients = body.ingredients.map { inputs in
            ingredientLines(inputs.map { ($0.foodId, $0.quantity, $0.servingUnit) }, lookup)
        }
        facts.steps = body.steps.map { stepLines($0.map(\.text)) }

        let record = before ?? lookup.recipe(lookup.resolveId(id))
        var old: RecipeFacts?
        if let record {
            var oldFacts = RecipeFacts()
            oldFacts.name = record.name
            oldFacts.servings = MacroFormat.servings(record.totalServings)
            oldFacts.cookedWeight = record.cookedWeight.map { amount($0, "g") }
            oldFacts.favorite = record.isFavorite ? L10n.pendingDetailYes : L10n.pendingDetailNo
            oldFacts.photo = photoText(record.imageUrl)
            oldFacts.ingredients = ingredientLines(
                (record.ingredients ?? []).map { ($0.foodId, $0.quantity, $0.servingUnit) }, lookup
            )
            oldFacts.steps = stepLines(record.orderedSteps.map(\.text))
            old = oldFacts
        }
        let fields = recipeFields(new: facts, old: old)
        let outcome = updateOutcome(fields, hasRecord: record != nil, isBefore: before != nil)
        var extras = outcome.changed.isEmpty ? changedLabels(fields) : changedLabels(outcome.changed)
        if extras.isEmpty, let count = body.ingredients?.count {
            extras = [L10n.pendingIngredientCount(count)]
        }
        return PendingChangeDetails(
            kind: .update,
            summary: PendingChangeSummary(
                title: title, subject: record?.name ?? lookup.recipeName(id) ?? body.name, extras: extras
            ),
            sections: outcome.sections,
            notes: outcome.notes
        )
    }

    private static func recipeFields(new: RecipeFacts, old: RecipeFacts?) -> [PendingChangeField] {
        let rows: [(String, String?, String?)] = [
            (L10n.name, new.name, old?.name),
            (L10n.servings, new.servings, old?.servings),
            (L10n.pendingDetailCookedWeight, new.cookedWeight, old?.cookedWeight),
            (L10n.favorite, new.favorite, old?.favorite),
            (L10n.pendingDetailPhoto, new.photo, old?.photo),
            (L10n.ingredients, new.ingredients, old?.ingredients),
            (L10n.pendingDetailSteps, new.steps, old?.steps),
        ]
        return rows.compactMap { label, newValue, oldValue in
            guard let newValue else { return nil }
            var result = PendingChangeField(label: label, value: newValue)
            if old != nil {
                let fallback = newValue == L10n.pendingDetailCleared ? newValue : emptyDash
                result.oldValue = oldValue ?? fallback
            }
            return result
        }
    }

    private static func ingredientLines(
        _ ingredients: [(String, Double, ServingUnit)],
        _ lookup: PendingChangeLookup
    ) -> String {
        ingredients.map { ingredient in
            let name = lookup.foodName(ingredient.0) ?? L10n.pendingDetailUnknownFood
            return "\(name) \u{00B7} \(amount(ingredient.1, ingredient.2.displayName))"
        }
        .joined(separator: "\n")
    }

    private static func stepLines(_ texts: [String]) -> String {
        texts.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
    }

    // MARK: - Shared builders

    private static func simple(
        _ kind: PendingChangeKind,
        title: String,
        subject: String?,
        fields: [PendingChangeField],
        extras: [String] = []
    ) -> PendingChangeDetails {
        PendingChangeDetails(
            kind: kind,
            summary: PendingChangeSummary(title: title, subject: subject, extras: extras),
            sections: fields.isEmpty ? [] : [PendingChangeSection(title: L10n.pendingDetailDetails, fields: fields)],
            notes: []
        )
    }

    private static func deletion(
        title: String,
        subject: String?,
        label: String?,
        id: String,
        notes: [String]
    ) -> PendingChangeDetails {
        let fields = if let subject, let label {
            [field(label, subject)]
        } else {
            [field(L10n.pendingDetailReference, id)]
        }
        return PendingChangeDetails(
            kind: .delete,
            summary: PendingChangeSummary(title: title, subject: subject, extras: []),
            sections: [PendingChangeSection(title: L10n.pendingDetailWillDelete, fields: fields)],
            notes: notes
        )
    }

    private static func generic(
        kind: PendingChangeKind,
        title: String,
        value: some Encodable,
        extras: [String] = []
    ) -> PendingChangeDetails {
        let dict = dictionary(of: value)
        let subject = nonEmpty(dict["name"] as? String)
        let section = PendingChangeSection(
            title: kind == .create ? L10n.pendingDetailCreatedWith : L10n.pendingDetailSubmitted,
            fields: genericFields(dict)
        )
        return PendingChangeDetails(
            kind: kind,
            summary: PendingChangeSummary(title: title, subject: subject, extras: extras),
            sections: section.fields.isEmpty ? [] : [section],
            notes: []
        )
    }

    private static func genericFields(of value: some Encodable) -> [PendingChangeField] {
        genericFields(dictionary(of: value))
    }

    private static func genericFields(_ dict: [String: Any]) -> [PendingChangeField] {
        dict.keys.sorted().compactMap { key in
            guard let raw = dict[key] else { return nil }
            return field(humanized(key), genericValue(raw))
        }
    }

    private static func genericValue(_ raw: Any) -> String {
        if raw is NSNull { return L10n.pendingDetailCleared }
        if let text = raw as? String { return text.isEmpty ? L10n.pendingDetailCleared : text }
        if let number = raw as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue ? L10n.pendingDetailYes : L10n.pendingDetailNo
            }
            return MacroFormat.nutrient(number.doubleValue)
        }
        if let list = raw as? [Any] {
            return list.isEmpty ? emptyDash : list.map { genericValue($0) }.joined(separator: ", ")
        }
        if let nested = raw as? [String: Any] {
            if nested.isEmpty { return emptyDash }
            return nested.keys.sorted().map { "\(humanized($0)): \(genericValue(nested[$0] ?? NSNull()))" }
                .joined(separator: ", ")
        }
        return "\(raw)"
    }

    /// "weightKg" becomes "Weight kg". English-only: this only labels the
    /// fallback rendering of the less common operations.
    static func humanized(_ key: String) -> String {
        var result = ""
        for character in key {
            if character.isUppercase, !result.isEmpty { result.append(" ") }
            result += result.isEmpty ? character.uppercased() : character.lowercased()
        }
        return result
    }

    // MARK: - Diffing

    private enum FieldKind {
        case text
        case meal
        case date
        case time
        case bool
        case list
        case nutrients
        case photo
        case servings
        case serving
        case number(String)
    }

    private struct FieldSpec {
        let key: String
        let label: String
        let kind: FieldKind
        var isExtended = false
    }

    private static let emptyDash = "\u{2014}"

    /// Every spec the submitted dictionary carries, rendered. With a cached
    /// record (`old`), each field also carries its old rendering.
    private static func compare(
        _ specs: [FieldSpec],
        new: [String: Any],
        old: [String: Any]?
    ) -> [PendingChangeField] {
        specs.compactMap { spec in
            guard let value = render(spec, in: new) else { return nil }
            var result = PendingChangeField(label: spec.label, value: value, isExtended: spec.isExtended)
            if let old {
                let cleared = L10n.pendingDetailCleared
                result.oldValue = render(spec, in: old) ?? (value == cleared ? cleared : emptyDash)
            }
            return result
        }
    }

    // swiftlint:disable:next cyclomatic_complexity
    private static func render(_ spec: FieldSpec, in dict: [String: Any]) -> String? {
        guard let raw = dict[spec.key] else { return nil }
        if raw is NSNull { return L10n.pendingDetailCleared }
        switch spec.kind {
        case .text:
            guard let text = raw as? String else { return nil }
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? L10n.pendingDetailCleared : trimmed
        case .meal:
            return (raw as? String).map { L10n.mealName($0) }
        case .date:
            return (raw as? String).map { dateText($0) }
        case .time:
            return (raw as? String).map { timeText($0) }
        case .bool:
            return (raw as? NSNumber).map { $0.boolValue ? L10n.pendingDetailYes : L10n.pendingDetailNo }
        case .list:
            guard let list = raw as? [String] else { return nil }
            return list.isEmpty ? L10n.pendingDetailCleared : list.joined(separator: ", ")
        case .nutrients:
            guard let values = raw as? [String: Any] else { return nil }
            return nutrientsText(values)
        case .photo:
            return photoText(raw as? String)
        case .servings:
            return (raw as? NSNumber).map { servingsText($0.doubleValue) }
        case .serving:
            guard let size = raw as? NSNumber else { return nil }
            let unit = (dict["servingUnit"] as? String).map { ServingUnit(rawValue: $0)?.displayName ?? $0 } ?? ""
            return amount(size.doubleValue, unit)
        case let .number(unit):
            return (raw as? NSNumber).map { amount($0.doubleValue, unit) }
        }
    }

    private static func nutrientsText(_ values: [String: Any]) -> String {
        let known = NutrientCatalog.all.compactMap { spec -> String? in
            guard let number = values[spec.key] as? NSNumber else { return nil }
            return "\(spec.label) \(amount(number.doubleValue, spec.unit))"
        }
        let knownKeys = Set(NutrientCatalog.all.map(\.key))
        let unknown = values.keys.filter { !knownKeys.contains($0) }.sorted().compactMap { key -> String? in
            guard let number = values[key] as? NSNumber else { return nil }
            return "\(humanized(key)) \(MacroFormat.nutrient(number.doubleValue))"
        }
        let all = known + unknown
        return all.isEmpty ? L10n.pendingDetailCleared : all.joined(separator: " \u{00B7} ")
    }

    private struct UpdateOutcome {
        let sections: [PendingChangeSection]
        let notes: [String]
        let changed: [PendingChangeField]
    }

    /// With the record the edit started from (`isBefore`, captured at enqueue)
    /// or a cached one, only the fields that differ from it; when the cached
    /// record already holds every submitted value (an offline edit is applied
    /// locally before it is queued) or there is no record, the submitted values.
    private static func updateOutcome(
        _ fields: [PendingChangeField],
        hasRecord: Bool,
        isBefore: Bool = false
    ) -> UpdateOutcome {
        let changed = hasRecord ? fields.filter { $0.oldValue != $0.value } : []
        if !changed.isEmpty {
            return UpdateOutcome(
                sections: [PendingChangeSection(title: L10n.pendingDetailChanges, fields: changed)],
                notes: [],
                changed: changed
            )
        }
        guard !fields.isEmpty else { return UpdateOutcome(sections: [], notes: [], changed: []) }
        var plain = fields
        for index in plain.indices {
            plain[index].oldValue = nil
        }
        return UpdateOutcome(
            sections: [PendingChangeSection(title: L10n.pendingDetailSubmitted, fields: compacted(plain))],
            notes: hasRecord && !isBefore ? [L10n.pendingDetailAlreadyLocal] : [],
            changed: []
        )
    }

    /// Folds the extended nutrients into one row ("Sodium 5 mg · Iron 2 mg").
    private static func compacted(_ fields: [PendingChangeField]) -> [PendingChangeField] {
        let extended = fields.filter { $0.isExtended && $0.oldValue == nil }
        guard !extended.isEmpty else { return fields }
        let merged = PendingChangeField(
            label: L10n.pendingDetailOtherNutrients,
            value: extended.map { "\($0.label) \($0.value)" }.joined(separator: " \u{00B7} ")
        )
        return fields.filter { !($0.isExtended && $0.oldValue == nil) } + [merged]
    }

    /// Short lowercase field names for a list row, capped at three.
    private static func changedLabels(_ fields: [PendingChangeField]) -> [String] {
        guard !fields.isEmpty else { return [] }
        let labels = fields.map { $0.label.lowercased() }
        let shown = labels.prefix(3).joined(separator: ", ")
        return [labels.count > 3 ? "\(shown) \(L10n.pendingMoreChanges(labels.count - 3))" : shown]
    }

    // MARK: - Formatting

    private static func field(_ label: String, _ value: String) -> PendingChangeField {
        PendingChangeField(label: label, value: value)
    }

    private static func dictionary(of value: some Encodable) -> [String: Any] {
        (try? JSONPatch.dictionary(of: value)) ?? [:]
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    private static func amount(_ value: Double, _ unit: String) -> String {
        unit.isEmpty ? MacroFormat.nutrient(value) : "\(MacroFormat.nutrient(value)) \(unit)"
    }

    private static func servingsText(_ value: Double) -> String {
        L10n.pendingServingsCount(MacroFormat.servings(value), plural: value != 1)
    }

    private static func photoText(_ imageUrl: String?) -> String {
        nonEmpty(imageUrl) == nil ? L10n.pendingDetailPhotoRemoved : L10n.pendingDetailPhotoSet
    }

    private static func dateText(_ iso: String) -> String {
        DateFormatting.date(from: iso).map { DateFormatting.displayString(from: $0) } ?? iso
    }

    private static func timeText(_ iso: String) -> String {
        DateFormatting.isoDateTime(from: iso).map { DateFormatting.timeString(from: $0) } ?? iso
    }
}
