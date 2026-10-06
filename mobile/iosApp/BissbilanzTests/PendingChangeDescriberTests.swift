@testable import Bissbilanz
import Foundation
import Testing

@Suite("Pending change summaries and diffs")
struct PendingChangeDescriberTests {
    private let dash = "\u{2014}"

    private func makeFood(id: String = "f1", name: String = "Coke Zero", barcode: String? = nil) throws -> Food {
        var json: [String: Any] = [
            "id": id, "userId": "u1", "name": name, "servingSize": 330, "servingUnit": "ml",
            "calories": 1, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0, "isFavorite": false,
        ]
        if let barcode { json["barcode"] = barcode }
        return try JSONPatch.decode(Food.self, from: json)
    }

    private func makeFoodCreate(name: String = "Coke Zero", barcode: String? = nil) -> FoodCreate {
        var body = FoodCreate(
            name: name, servingSize: 330, servingUnit: .ml, calories: 1, protein: 0, carbs: 0, fat: 0, fiber: 0
        )
        body.barcode = barcode
        return body
    }

    private func makeEntry(notes: String? = nil) throws -> Entry {
        var json: [String: Any] = [
            "id": "e1", "mealType": "Dinner", "servings": 1, "foodId": "f1", "foodName": "Coke Zero",
            "date": "2026-10-06",
        ]
        if let notes { json["notes"] = notes }
        return try JSONPatch.decode(Entry.self, from: json)
    }

    private func makeRecipe() throws -> Recipe {
        try JSONPatch.decode(Recipe.self, from: [
            "id": "r1", "name": "Porridge", "totalServings": 2, "isFavorite": false,
            "ingredients": [["foodId": "f1", "quantity": 100, "servingUnit": "g", "sortOrder": 0]],
        ])
    }

    private func lookup(foods: [Food] = [], entries: [Entry] = [], recipes: [Recipe] = []) -> PendingChangeLookup {
        PendingChangeLookup(
            food: { id in foods.first { $0.id == id } },
            recipe: { id in recipes.first { $0.id == id } },
            entry: { id in entries.first { $0.id == id } }
        )
    }

    private func entryCreate(foodId: String? = "f1", servings: Double = 1) -> EntryCreate {
        EntryCreate(foodId: foodId, mealType: "Dinner", servings: servings, date: "2026-10-06")
    }

    private func details(_ operation: SyncOperation, _ lookup: PendingChangeLookup = PendingChangeLookup())
        -> PendingChangeDetails
    {
        PendingChangeDescriber.details(type: operation.typeName, operation: operation, lookup: lookup)
    }

    // MARK: - List row summaries

    @Test("A logged entry names the food, servings and meal")
    func createEntrySummary() throws {
        let result = details(
            .createEntry(body: entryCreate(), localId: "temp_e"), lookup(foods: [try makeFood()])
        ).summary

        #expect(result.primary == "Coke Zero")
        #expect(result.extras == [L10n.pendingServingsCount("1", plural: false), L10n.mealName("Dinner")])
        let title = L10n.pendingChangeTitle(forType: "create_entry")
        let servings = L10n.pendingServingsCount("1", plural: false)
        #expect(result.secondary == "\(title) \u{00B7} \(servings) \u{00B7} \(L10n.mealName("Dinner"))")
    }

    @Test("Servings pluralise")
    func servingsPlural() {
        let result = details(.createEntry(body: entryCreate(servings: 2.5), localId: "temp_e")).summary
        #expect(result.extras.first == L10n.pendingServingsCount("2.5", plural: true))
    }

    @Test("A temp food id resolves through the id map and the queued create")
    func tempFoodIdResolves() throws {
        let server = try makeFood(id: "f-server", name: "Skyr")
        var withMap = lookup(foods: [server])
        withMap.resolveId = { $0 == "temp_f" ? "f-server" : $0 }
        let viaMap = details(.createEntry(body: entryCreate(foodId: "temp_f"), localId: "temp_e"), withMap)
        #expect(viaMap.summary.subject == "Skyr")

        var queued = PendingChangeLookup()
        let create = SyncOperation.createFood(body: makeFoodCreate(name: "Oat milk"), localId: "temp_f")
        queued.queuedNames = PendingChangeLookup.names(of: [create])
        let viaQueue = details(.createEntry(body: entryCreate(foodId: "temp_f"), localId: "temp_e"), queued)
        #expect(viaQueue.summary.subject == "Oat milk")
    }

    @Test("A quick entry falls back to its own name, then to the generic title")
    func quickEntryNameFallback() {
        let quick = EntryCreate(
            mealType: "Snacks", servings: 1, date: "2026-10-06", quickName: "Protein bar", quickCalories: 200,
            quickProtein: 20
        )
        let named = details(.createEntry(body: quick, localId: "temp_e"))
        #expect(named.summary.subject == "Protein bar")
        let values = named.sections.flatMap(\.fields)
        #expect(values.first { $0.label == L10n.quickEntry }?.value == "Protein bar")
        #expect(values.first { $0.label == L10n.calories }?.value == "200 kcal")
        #expect(values.first { $0.label == L10n.protein }?.value == "20 g")
        #expect(values.filter { $0.label == L10n.name }.isEmpty)

        let unresolved = details(.createEntry(body: entryCreate(foodId: "gone"), localId: "temp_e"))
        #expect(unresolved.summary.subject == nil)
        #expect(unresolved.summary.primary == L10n.pendingChangeTitle(forType: "create_entry"))
    }

    @Test("An operation that did not decode keeps the generic title")
    func undecodableOperation() {
        let result = PendingChangeDescriber.details(type: "create_food", operation: nil, lookup: PendingChangeLookup())
        #expect(result.summary.primary == L10n.pendingChangeTitle(forType: "create_food"))
        #expect(result.summary.secondary == nil)
        #expect(result.sections.isEmpty)
        #expect(result.kind == .create)
    }

    // MARK: - Creates

    @Test("A created entry lists the values it was created with")
    func createEntryFields() throws {
        let body = EntryCreate(
            foodId: "f1", mealType: "Dinner", servings: 1.5, date: "2026-10-06", notes: "late",
            eatenAt: "2026-10-06T18:30:00Z"
        )
        let result = details(.createEntry(body: body, localId: "temp_e"), lookup(foods: [try makeFood()]))

        #expect(result.kind == .create)
        let fields = try #require(result.sections.first).fields
        #expect(fields.map(\.label) == [
            L10n.pendingDetailFood, L10n.servings, L10n.servingSize, L10n.meal, L10n.date, L10n.time, L10n.notes,
        ])
        #expect(fields.first { $0.label == L10n.servings }?.value == L10n.pendingServingsCount("1.5", plural: true))
        #expect(fields.first { $0.label == L10n.servingSize }?.value == "330 ml")
        #expect(fields.first { $0.label == L10n.meal }?.value == L10n.mealName("Dinner"))
        #expect(fields.first { $0.label == L10n.notes }?.value == "late")
        #expect(fields.allSatisfy { $0.oldValue == nil })
    }

    @Test("A created food shows its macros and folds extended nutrients into one row")
    func createFoodFields() throws {
        var body = makeFoodCreate(name: "Skyr", barcode: "7612345")
        body.brand = "Milbona"
        body.sodium = 40
        body.iron = 0.5
        let result = details(.createFood(body: body, localId: "temp_f"))

        #expect(result.summary.subject == "Skyr")
        #expect(result.summary.extras.first == "Milbona")
        let fields = try #require(result.sections.first).fields
        #expect(fields.first { $0.label == L10n.brand }?.value == "Milbona")
        #expect(fields.first { $0.label == L10n.barcode }?.value == "7612345")
        #expect(fields.first { $0.label == L10n.servingSize }?.value == "330 ml")
        #expect(fields.first { $0.label == L10n.calories }?.value == "1 kcal")
        #expect(fields.filter { $0.label == "Sodium" || $0.label == "Iron" }.isEmpty)
        let nutrients = try #require(fields.first { $0.label == L10n.pendingDetailOtherNutrients })
        #expect(nutrients.value == "Sodium 40 mg \u{00B7} Iron 0.5 mg")
    }

    @Test("A created recipe lists its ingredients by food name")
    func createRecipeFields() throws {
        let body = RecipeCreate(
            name: "Porridge", totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 100, servingUnit: .g)]
        )
        let result = details(.createRecipe(body: body, localId: "temp_r"), lookup(foods: [try makeFood(name: "Oats")]))

        #expect(result.summary.subject == "Porridge")
        #expect(result.summary.extras == [
            L10n.pendingServingsCount("2", plural: true), L10n.pendingIngredientCount(1),
        ])
        let fields = try #require(result.sections.first).fields
        #expect(fields.first { $0.label == L10n.ingredients }?.value == "Oats \u{00B7} 100 g")
    }

    // MARK: - Edits

    @Test("An edit lists only the fields that differ from the cached food")
    func updateFoodDiff() throws {
        let local = try makeFood(barcode: nil)
        let result = details(
            .updateFood(id: "f1", body: makeFoodCreate(barcode: "7612345")), lookup(foods: [local])
        )

        #expect(result.kind == .update)
        #expect(result.summary.subject == "Coke Zero")
        #expect(result.summary.extras == [L10n.barcode.lowercased()])
        let section = try #require(result.sections.first)
        #expect(section.title == L10n.pendingDetailChanges)
        #expect(section.fields.count == 1)
        let change = try #require(section.fields.first)
        #expect(change.label == L10n.barcode)
        #expect(change.oldValue == dash)
        #expect(change.value == "7612345")
        #expect(result.notes.isEmpty)
    }

    @Test("An edit the local copy already contains shows the submitted values")
    func updateFoodAlreadyApplied() throws {
        let local = try makeFood(barcode: "7612345")
        let result = details(
            .updateFood(id: "f1", body: makeFoodCreate(barcode: "7612345")), lookup(foods: [local])
        )

        let section = try #require(result.sections.first)
        #expect(section.title == L10n.pendingDetailSubmitted)
        #expect(section.fields.contains { $0.label == L10n.barcode && $0.value == "7612345" })
        #expect(section.fields.allSatisfy { $0.oldValue == nil })
        #expect(result.notes == [L10n.pendingDetailAlreadyLocal])
    }

    @Test("An edit without a cached food lists the submitted values")
    func updateFoodWithoutRecord() throws {
        let result = details(.updateFood(id: "f1", body: makeFoodCreate(barcode: "7612345")))

        #expect(result.summary.subject == "Coke Zero")
        let section = try #require(result.sections.first)
        #expect(section.title == L10n.pendingDetailSubmitted)
        #expect(section.fields.first { $0.label == L10n.barcode }?.value == "7612345")
        #expect(result.notes.isEmpty)
    }

    @Test("An entry edit diffs servings and flags a cleared note")
    func updateEntryDiff() throws {
        let local = try makeEntry(notes: "late")
        var body = EntryUpdate()
        body.servings = 2
        body.notes = .some(nil)
        let result = details(.updateEntry(id: "e1", body: body), lookup(entries: [local]))

        #expect(result.summary.subject == "Coke Zero")
        let section = try #require(result.sections.first)
        #expect(section.title == L10n.pendingDetailChanges)
        let servings = try #require(section.fields.first { $0.label == L10n.servings })
        #expect(servings.oldValue == L10n.pendingServingsCount("1", plural: false))
        #expect(servings.value == L10n.pendingServingsCount("2", plural: true))
        let notes = try #require(section.fields.first { $0.label == L10n.notes })
        #expect(notes.oldValue == "late")
        #expect(notes.value == L10n.pendingDetailCleared)
    }

    @Test("An entry edit with no cached entry names the submitted fields")
    func updateEntryWithoutRecord() {
        var body = EntryUpdate()
        body.mealType = "Lunch"
        body.quickName = .some("Salad")
        let result = details(.updateEntry(id: "e1", body: body))

        #expect(result.summary.subject == "Salad")
        #expect(result.summary.extras == ["\(L10n.name.lowercased()), \(L10n.meal.lowercased())"])
        let fields = result.sections.flatMap(\.fields)
        #expect(fields.first { $0.label == L10n.meal }?.value == L10n.mealName("Lunch"))
    }

    @Test("A recipe edit diffs ingredients")
    func updateRecipeDiff() throws {
        let oats = try makeFood(name: "Oats")
        let body = RecipeUpdate(ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 150, servingUnit: .g)])
        let result = details(.updateRecipe(id: "r1", body: body), lookup(foods: [oats], recipes: [try makeRecipe()]))

        #expect(result.summary.subject == "Porridge")
        #expect(result.summary.extras == [L10n.ingredients.lowercased()])
        let change = try #require(result.sections.first?.fields.first)
        #expect(change.label == L10n.ingredients)
        #expect(change.oldValue == "Oats \u{00B7} 100 g")
        #expect(change.value == "Oats \u{00B7} 150 g")
    }

    // MARK: - Deletes and other operations

    @Test("A food delete names the food and notes a forced delete")
    func deleteFood() throws {
        let plain = details(.deleteFood(id: "f1", force: false), lookup(foods: [try makeFood()]))
        #expect(plain.kind == .delete)
        #expect(plain.summary.subject == "Coke Zero")
        #expect(plain.sections.first?.title == L10n.pendingDetailWillDelete)
        #expect(plain.notes.isEmpty)

        let forced = details(.deleteFood(id: "f1", force: true), lookup(foods: [try makeFood()]))
        #expect(forced.notes == [L10n.pendingDetailForced])

        let unknown = details(.deleteFood(id: "f9", force: false))
        #expect(unknown.summary.subject == nil)
        #expect(unknown.sections.first?.fields.first?.value == "f9")
    }

    @Test("An entry delete lists the entry while it is still cached")
    func deleteEntry() throws {
        let known = details(.deleteEntry(id: "e1"), lookup(entries: [try makeEntry()]))
        #expect(known.summary.subject == "Coke Zero")
        let labels = try #require(known.sections.first).fields.map(\.label)
        #expect(labels == [L10n.pendingDetailFood, L10n.servings, L10n.meal, L10n.date])

        let unknown = details(.deleteEntry(id: "e1"))
        #expect(unknown.summary.subject == nil)
        #expect(unknown.sections.first?.fields.first?.label == L10n.pendingDetailReference)
    }

    @Test("Less common operations render their payload generically")
    func genericOperations() throws {
        let weightBody = WeightCreate(weightKg: 72.5, entryDate: "2026-10-06", notes: nil)
        let weight = details(.createWeight(body: weightBody, localId: "temp_w"))
        #expect(weight.kind == .create)
        #expect(weight.summary.extras.first == "72.5 kg")
        let fields = try #require(weight.sections.first).fields
        #expect(fields.contains { $0.label == "Weight kg" && $0.value == "72.5" })

        let favorite = details(.toggleFavorite(id: "f1", isFavorite: true), lookup(foods: [try makeFood()]))
        #expect(favorite.summary.subject == "Coke Zero")
        #expect(favorite.sections.first?.fields.first?.value == L10n.pendingDetailYes)

        let clearedPhoto = details(.setFoodImage(id: "f1", imageUrl: nil))
        #expect(clearedPhoto.sections.first?.fields.first?.value == L10n.pendingDetailPhotoRemoved)

        let labels = details(.setFoodLabels(id: "f1", labels: ["bottle", "soda"]))
        #expect(labels.sections.first?.fields.first?.value == "bottle, soda")
    }

    // MARK: - Helpers

    @Test("The discard message names what is lost per kind of change")
    func discardMessages() throws {
        let create = details(.createFood(body: makeFoodCreate(), localId: "temp_f"))
        #expect(create.discardMessage == L10n.pendingDiscardCreate("Coke Zero"))
        let update = details(.updateFood(id: "f1", body: makeFoodCreate()))
        #expect(update.discardMessage == L10n.pendingDiscardUpdate("Coke Zero"))
        let removal = details(.deleteEntry(id: "e1"))
        #expect(removal.discardMessage == L10n.pendingDiscardDelete(L10n.pendingChangeTitle(forType: "delete_entry")))
        let other = details(.setGoals(body: .defaults))
        #expect(other.kind == .update)
    }

    @Test("Operation types map to a kind and an icon")
    func kindAndIcon() {
        #expect(PendingChangeDescriber.kind(forType: "create_entry") == .create)
        #expect(PendingChangeDescriber.kind(forType: "update_food") == .update)
        #expect(PendingChangeDescriber.kind(forType: "set_goals") == .update)
        #expect(PendingChangeDescriber.kind(forType: "delete_recipe") == .delete)
        #expect(PendingChangeDescriber.kind(forType: "unlog_supplement") == .delete)
        #expect(PendingChangeDescriber.kind(forType: "complete_ai_task") == .other)
        #expect(PendingChangeDescriber.icon(forType: "set_food_labels") == "fork.knife")
        #expect(PendingChangeDescriber.icon(forType: "create_entry") == "plus.circle")
        #expect(PendingChangeDescriber.icon(forType: "something_new") == "arrow.triangle.2.circlepath")
    }

    @Test("Camel-case payload keys become readable labels")
    func humanizedKeys() {
        #expect(PendingChangeDescriber.humanized("weightKg") == "Weight kg")
        #expect(PendingChangeDescriber.humanized("notes") == "Notes")
    }
}
