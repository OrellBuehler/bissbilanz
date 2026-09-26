import SwiftUI

struct RecipeEditSheet: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(\.dismiss) private var dismiss

    let existingRecipe: Recipe?
    let onSaved: (Recipe) -> Void

    @State private var name = ""
    @State private var totalServings = "1"
    @State private var cookedWeight = ""
    @State private var isFavorite = false
    @State private var ingredients: [IngredientRow] = []
    @State private var imageUrl: String?
    @State private var originalImageUrl: String?
    @State private var isSaving = false
    @State private var errorMessage: String?

    /// `food` is nil when the server-shaped recipe's ingredient couldn't be resolved
    /// against the local food store or the API (e.g. offline with nothing cached) —
    /// the row is still kept and saved, showing `L10n.unknownIngredient` instead.
    struct IngredientRow: Identifiable {
        let id = UUID()
        var foodId: String
        var food: Food?
        var quantity: String
        var unit: ServingUnit
    }

    init(recipe: Recipe? = nil, onSaved: @escaping (Recipe) -> Void = { _ in }) {
        existingRecipe = recipe
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.recipePhoto) {
                    FoodImageField(imageUrl: $imageUrl)
                }

                Section {
                    TextField(L10n.recipeName, text: $name)
                    HStack {
                        Text(L10n.totalServings)
                        Spacer()
                        TextField("1", text: $totalServings)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 60)
                    }
                    Toggle(L10n.favorites, isOn: $isFavorite)
                }

                Section {
                    HStack {
                        Text(L10n.cookedWeight)
                        Spacer()
                        TextField("", text: $cookedWeight)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 60)
                    }
                } footer: {
                    Text(cookedWeightFooter)
                }

                Section(L10n.ingredients) {
                    ForEach($ingredients) { $ingredient in
                        HStack {
                            Text(ingredient.food?.name ?? L10n.unknownIngredient)
                                .lineLimit(1)
                            Spacer()
                            TextField("1", text: $ingredient.quantity)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                            // Only units compatible with the ingredient's food (mass with
                            // mass, volume with volume) — a mismatch has no conversion.
                            Picker("", selection: $ingredient.unit) {
                                let units = compatibleUnits(for: ingredient.food?.servingUnit ?? ingredient.unit)
                                ForEach(units, id: \.self) { unit in
                                    Text(unit.displayName).tag(unit)
                                }
                            }
                            .frame(width: 60)
                        }
                    }
                    .onDelete { indices in
                        ingredients.remove(atOffsets: indices)
                    }

                    // Pushed, not presented: picking an ingredient is a step
                    // inside this sheet's flow, and the picker pops itself
                    // back to the list once a food is chosen.
                    NavigationLink {
                        FoodPicker { food in
                            ingredients.append(IngredientRow(
                                foodId: food.id,
                                food: food,
                                quantity: "\(food.servingSize)",
                                unit: food.servingUnit
                            ))
                        }
                    } label: {
                        Label(L10n.addIngredient, systemImage: "plus")
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .keyboardDismissable()
            .navigationTitle(existingRecipe != nil ? L10n.editRecipe : L10n.createRecipe)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(
                        name.isEmpty || ingredients.isEmpty || isSaving ||
                            !((Double.parseUserInput(totalServings) ?? 0) > 0)
                    )
                    .fontWeight(.semibold)
                }
            }
            .task { await prefill() }
        }
    }

    /// The per-100g calorie hint once a cooked weight is entered, or the generic
    /// hint before one is. Uses the recipe's last-known whole-recipe calories
    /// (from `existingRecipe`) since a fresh, unsaved edit has no server total yet.
    private var cookedWeightFooter: String {
        if let calories = existingRecipe?.calories, let value = Double.parseUserInput(cookedWeight), value > 0 {
            return L10n.cookedWeightPer100g(Int((calories / value) * 100))
        }
        return L10n.cookedWeightHint
    }

    /// The server's recipe response has no embedded `food` on ingredients — resolve
    /// each one against the local food store, fetching from the API if it isn't
    /// cached. An ingredient whose food still can't be resolved is NEVER dropped
    /// (it shows `L10n.unknownIngredient` and still saves).
    private func prefill() async {
        guard let recipe = existingRecipe else { return }
        name = recipe.name
        totalServings = "\(recipe.totalServings)"
        cookedWeight = recipe.cookedWeight.map { "\($0)" } ?? ""
        isFavorite = recipe.isFavorite
        imageUrl = recipe.imageUrl
        originalImageUrl = recipe.imageUrl
        ingredients = await Self.resolvedIngredientRows(for: recipe, foodRepository: foodRepository)
    }

    /// Resolves each of `recipe`'s ingredients into an `IngredientRow`, hydrating
    /// `food` from `foodRepository` (cache first, then API) when the recipe's own
    /// ingredient carries none — the server response never embeds one. Every
    /// ingredient is kept, even when its food can't be resolved at all: dropping
    /// one here would silently delete it from the recipe on the next save.
    /// Internal (not private) so it's directly testable.
    @MainActor
    static func resolvedIngredientRows(for recipe: Recipe, foodRepository: FoodRepository) async -> [IngredientRow] {
        guard let recipeIngredients = recipe.ingredients else { return [] }
        var rows: [IngredientRow] = []
        for ing in recipeIngredients {
            var food = ing.food ?? foodRepository.food(id: ing.foodId)
            if food == nil {
                try? await foodRepository.refreshFood(id: ing.foodId)
                food = foodRepository.food(id: ing.foodId)
            }
            rows.append(
                IngredientRow(foodId: ing.foodId, food: food, quantity: "\(ing.quantity)", unit: ing.servingUnit)
            )
        }
        return rows
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let ingredientInputs = ingredients.map { ing in
            RecipeIngredientInput(
                foodId: ing.foodId,
                quantity: Double.parseUserInput(ing.quantity) ?? 1,
                servingUnit: ing.unit
            )
        }

        do {
            var saved: Recipe
            var photoFailed = false
            let parsedCookedWeight = Double.parseUserInput(cookedWeight).flatMap { $0 > 0 ? $0 : nil }
            if let existing = existingRecipe {
                var update = RecipeUpdate(
                    name: name,
                    totalServings: Double.parseUserInput(totalServings) ?? 1,
                    ingredients: ingredientInputs,
                    isFavorite: isFavorite
                )
                // Always sent, never omitted — see `EntryEditSheet.notes` for the
                // same reasoning: an emptied cooked weight has to reach the server
                // as an explicit null or the old value survives the edit.
                update.cookedWeight = .some(parsedCookedWeight)
                saved = try await recipeRepository.updateRecipe(id: existing.id, update)
                // Separate from the body when editing: `RecipeUpdate` omits nil
                // optionals, so a removal sent that way would be dropped and
                // the old image would stay.
                //
                // Caught separately because the recipe itself is saved by now:
                // letting this throw out would report a generic save failure
                // for a change that actually landed. The sheet stays open on
                // the photo error so Save can retry just the image.
                if imageUrl != originalImageUrl {
                    do {
                        saved = try await recipeRepository.setImage(id: existing.id, imageUrl: imageUrl)
                    } catch {
                        ErrorReporter.captureWarning(
                            "Recipe image save failed",
                            context: ["reason": ErrorReporter.reason(for: error)]
                        )
                        photoFailed = true
                    }
                }
            } else {
                // No id yet on a create, so the already-uploaded URL rides
                // along on the create body — `recipeCreateSchema` accepts it.
                let create = RecipeCreate(
                    name: name,
                    totalServings: Double.parseUserInput(totalServings) ?? 1,
                    ingredients: ingredientInputs,
                    isFavorite: isFavorite,
                    imageUrl: imageUrl,
                    cookedWeight: parsedCookedWeight
                )
                saved = try await recipeRepository.createRecipe(create)
            }
            // The parent gets the saved recipe either way; only a clean save
            // closes the sheet.
            onSaved(saved)
            if photoFailed {
                errorMessage = L10n.photoSaveFailed
            } else {
                dismiss()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

/// Food search step for picking an ingredient, pushed within the recipe
/// editor's stack — the system back button covers cancellation, and picking
/// a food pops back to the ingredient list.
struct FoodPicker: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(\.dismiss) private var dismiss

    let onPicked: (Food) -> Void
    /// Food ids to leave out of results — the food-merge flow uses this so a
    /// food can't be picked as its own merge target.
    var excludingIds: Set<String> = []

    @State private var query = ""
    @State private var results: [Food] = []
    @State private var offResults: [BissbilanzAPI.OpenFoodFactsSearchHit] = []
    @State private var isSearching = false
    @State private var isSearchingOff = false
    @State private var isResolvingOff = false
    @State private var errorMessage: String?
    @State private var searchTask: Task<Void, Never>?

    /// Same threshold as the main food search: Open Food Facts only fills in
    /// when the user's own database barely matched.
    private static let offFallbackThreshold = 5

    var body: some View {
        Group {
            if query.count < 2 {
                ContentUnavailableView(
                    L10n.search,
                    systemImage: "magnifyingglass",
                    description: Text(L10n.typeToSearchHint)
                )
            } else if isSearching {
                LoadingView()
            } else if results.isEmpty, offResults.isEmpty, !isSearchingOff {
                ContentUnavailableView(L10n.noResults, systemImage: "magnifyingglass")
            } else {
                List {
                    ForEach(results) { food in
                        Button {
                            onPicked(food)
                            dismiss()
                        } label: {
                            foodRow(name: food.name, imageUrl: food.imageUrl, detail: detailText(
                                calories: food.calories,
                                servingSize: food.servingSize,
                                unit: food.servingUnit.displayName
                            ))
                        }
                    }
                    if isSearchingOff || !offResults.isEmpty {
                        Section(L10n.openFoodFacts) {
                            if isSearchingOff {
                                HStack {
                                    Spacer()
                                    ProgressView()
                                    Spacer()
                                }
                            } else {
                                ForEach(offResults) { hit in
                                    Button {
                                        Task { await pickFromOpenFoodFacts(hit) }
                                    } label: {
                                        foodRow(name: hit.name, imageUrl: hit.imageUrl, detail: hit.brand ?? "")
                                    }
                                    .disabled(isResolvingOff)
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(L10n.selectFood)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: L10n.searchFoods)
        .onChange(of: query) { _, newValue in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
                await search(newValue)
            }
        }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func foodRow(name: String, imageUrl: String?, detail: String) -> some View {
        HStack(spacing: 12) {
            // Matches the main food search rows; nothing is reserved when the
            // food has no picture.
            if imageUrl != nil {
                FoodImageView(imageUrl: imageUrl)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .foregroundStyle(.primary)
                if !detail.isEmpty {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func detailText(calories: Double, servingSize: Double, unit: String) -> String {
        "\(Int(calories)) cal \u{00B7} \(MacroFormat.nutrient(servingSize)) \(unit)"
    }

    /// Copy-on-use, exactly like the main food search: the hit becomes a food in
    /// the user's own database (or resolves to the one already there) before it
    /// can be an ingredient — a recipe references a food id, not a product.
    private func pickFromOpenFoodFacts(_ hit: BissbilanzAPI.OpenFoodFactsSearchHit) async {
        guard !isResolvingOff else { return }
        isResolvingOff = true
        defer { isResolvingOff = false }
        do {
            guard let food = try await foodRepository.findOrCreateFromOpenFoodFacts(barcode: hit.barcode) else {
                errorMessage = L10n.openFoodFactsAddFailed
                return
            }
            onPicked(food)
            dismiss()
        } catch {
            ErrorReporter.captureWarning("Open Food Facts ingredient resolution failed", context: ["reason": ErrorReporter.reason(for: error)])
            errorMessage = L10n.openFoodFactsAddFailed
        }
    }

    private func search(_ query: String) async {
        // Every exit clears the spinners, including the cancellation guards
        // below — those used to return with `isSearching`/`isSearchingOff`
        // still true and only recovered because a superseding task re-entered.
        // Guarded on the query still being the one in the field so a superseded
        // search can't switch off the flags its successor just turned on.
        defer {
            if query == self.query {
                isSearching = false
                isSearchingOff = false
            }
        }
        guard query.count >= 2 else {
            results = []
            offResults = []
            return
        }
        isSearching = true
        let found = await foodRepository.searchFoods(query: query)
        guard !Task.isCancelled, query == self.query else { return }
        results = excludingIds.isEmpty ? found : found.filter { !excludingIds.contains($0.id) }
        isSearching = false
        guard found.count < Self.offFallbackThreshold else {
            offResults = []
            return
        }
        isSearchingOff = true
        offResults = []
        let hits = await foodRepository.searchOpenFoodFacts(query: query)
        guard !Task.isCancelled, query == self.query else { return }
        offResults = hits
    }
}
