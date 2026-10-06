import SwiftUI

struct RecipeEditSheet: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(AppModeManager.self) private var appMode
    @Environment(FoodLabeler.self) private var foodLabeler
    @Environment(FoodImageLoader.self) private var foodImageLoader
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
    @State private var steps: [StepRow] = []
    // What the recipe had when the sheet opened: an update only carries `steps`
    // when they differ, since a present list replaces every step server-side.
    @State private var originalSteps: [RecipeStepInput] = []
    // False while an existing recipe's steps are unknown (a summary-shaped cache
    // that couldn't be refreshed). Editing then would replace steps that were
    // never seen, so the section stays read-only until the recipe has loaded.
    @State private var stepsLoaded = true
    @State private var editMode: EditMode = .inactive
    @FocusState private var focusedStep: UUID?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showRecipePicker = false
    @State private var labels: [String] = []
    @State private var originalLabels: [String] = []
    @State private var isSuggestingLabels = false
    @State private var suggestLabelsError: String?

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

    struct StepRow: Identifiable, Equatable {
        let id = UUID()
        var text: String
        var imageUrl: String?
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
                            .accessibilityLabel(L10n.totalServings)
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
                            .accessibilityLabel(L10n.cookedWeight)
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
                                .accessibilityLabel(L10n.amount)
                            // Only units compatible with the ingredient's food (mass with
                            // mass, volume with volume) — a mismatch has no conversion.
                            Picker("", selection: $ingredient.unit) {
                                let units = compatibleUnits(for: ingredient.food?.servingUnit ?? ingredient.unit)
                                ForEach(units, id: \.self) { unit in
                                    Text(unit.displayName).tag(unit)
                                }
                            }
                            .frame(width: 60)
                            .accessibilityLabel(L10n.unit)
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

                    Button {
                        showRecipePicker = true
                    } label: {
                        Label(L10n.addFromRecipe, systemImage: "book.closed")
                    }
                }

                stepsSection

                LabelEditorSection(
                    labels: $labels,
                    hint: L10n.recipeLabelsHint,
                    suggestHint: L10n.suggestRecipeLabelsHint,
                    canSuggest: foodLabeler.isAvailable && !ingredients.isEmpty,
                    isSuggesting: isSuggestingLabels,
                    suggestError: suggestLabelsError
                ) {
                    Task { await suggestLabels() }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .environment(\.editMode, $editMode)
            .keyboardDismissable()
            .navigationDestination(isPresented: $showRecipePicker) {
                RecipeSourcePicker(currentIngredientCount: ingredients.count) { source, factor in
                    await addFromRecipe(source, factor: factor)
                }
            }
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

    /// Ordered cooking steps: text, an optional photo, reorder and delete. The
    /// reorder handles only exist in edit mode, toggled from the header, which
    /// also keeps the rows short (no photo controls) while one is being dragged.
    @ViewBuilder
    private var stepsSection: some View {
        Section {
            if stepsLoaded {
                ForEach(steps) { step in
                    stepRow(step)
                }
                .onMove { source, destination in
                    steps.move(fromOffsets: source, toOffset: destination)
                }
                .onDelete { indices in
                    steps.remove(atOffsets: indices)
                }

                if steps.count < RecipeStepLimits.maxSteps {
                    Button {
                        let row = StepRow(text: "", imageUrl: nil)
                        steps.append(row)
                        focusedStep = row.id
                    } label: {
                        Label(L10n.recipeStepAdd, systemImage: "plus")
                    }
                } else {
                    Text(L10n.recipeStepsLimit(RecipeStepLimits.maxSteps))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text(L10n.recipeStepsUnavailable)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } header: {
            HStack {
                Text(L10n.recipeSteps)
                Spacer()
                if stepsLoaded, steps.count > 1 {
                    Button(editMode.isEditing ? L10n.done : L10n.recipeStepReorder) {
                        withAnimation {
                            editMode = editMode.isEditing ? .inactive : .active
                        }
                    }
                    .textCase(nil)
                }
            }
        } footer: {
            Text(L10n.recipeStepsFooter)
        }
    }

    private func stepRow(_ step: StepRow) -> some View {
        let number = (steps.firstIndex(where: { $0.id == step.id }) ?? 0) + 1
        return VStack(alignment: .leading, spacing: 8) {
            Text(L10n.recipeStepNumber(number))
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField(L10n.recipeStepPlaceholder, text: stepTextBinding(for: step.id), axis: .vertical)
                .lineLimit(editMode.isEditing ? (1 ... 2) : (2 ... 10))
                .focused($focusedStep, equals: step.id)
                .accessibilityLabel(L10n.recipeStepNumber(number))
            if !editMode.isEditing {
                RecipeStepPhotoField(imageUrl: step.imageUrl, stepNumber: number) { url in
                    if let index = steps.firstIndex(where: { $0.id == step.id }) {
                        steps[index].imageUrl = url
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    /// By id rather than by index: `ForEach($steps)` bindings index into the
    /// array, and a write that lands after the row was deleted or moved (an
    /// autocorrect commit, say) would otherwise hit the wrong step or trap.
    private func stepTextBinding(for id: UUID) -> Binding<String> {
        Binding(
            get: { steps.first(where: { $0.id == id })?.text ?? "" },
            set: { newValue in
                if let index = steps.firstIndex(where: { $0.id == id }) {
                    steps[index].text = newValue
                }
            }
        )
    }

    /// The steps as the server takes them: trimmed, blank ones dropped, and the
    /// server's length and count caps applied. Internal so it is testable.
    static func stepInputs(from rows: [StepRow]) -> [RecipeStepInput] {
        RecipeStepInput.sanitized(rows.map { RecipeStepInput(text: $0.text, imageUrl: $0.imageUrl) })
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
        await prefillSteps(for: recipe)
        // After the steps: that may have refreshed the detail, and a list copy
        // from an older cache carries no labels yet.
        labels = (recipeRepository.recipe(id: recipe.id) ?? recipe).labels ?? []
        originalLabels = labels
    }

    /// Runs the labeller on the form's current values and merges its
    /// suggestions into `labels` for review — nothing is saved until the
    /// user hits Save, same as a manually typed label. The ingredients' food
    /// names come from the rows being edited, so it works before the first
    /// save too.
    private func suggestLabels() async {
        isSuggestingLabels = true
        suggestLabelsError = nil
        do {
            let image = await foodImageLoader.image(for: imageUrl)
            let suggestions = try await foodLabeler.labels(for: FoodLabelInput(
                recipeName: name,
                ingredientNames: ingredients.compactMap { $0.food?.name },
                image: image
            ))
            labels = LabelNormalizer.normalizeAll(labels + suggestions).sorted()
        } catch {
            suggestLabelsError = (error as? FoodLabelerError)?.localizedMessage ?? error.localizedDescription
        }
        isSuggestingLabels = false
    }

    /// A recipe copied from the list endpoint (or cached by an older build) has
    /// no `steps`; fetch the detail once so the editor shows — and never
    /// silently replaces — what the recipe really has. Local mode has no server,
    /// so a missing list there simply means no steps.
    private func prefillSteps(for recipe: Recipe) async {
        var source = recipe
        if source.steps == nil, !appMode.isLocal, !LocalStore.isTempId(recipe.id) {
            try? await recipeRepository.refreshRecipe(id: recipe.id)
            source = recipeRepository.recipe(id: recipe.id) ?? recipe
        }
        let loaded: [RecipeStep]
        if let known = source.steps {
            loaded = known
        } else if appMode.isLocal || source.stepCount == 0 {
            loaded = []
        } else {
            stepsLoaded = false
            return
        }
        let inputs = loaded.sorted { $0.sortOrder < $1.sortOrder }.map(\.input)
        originalSteps = inputs
        steps = inputs.map { StepRow(text: $0.text, imageUrl: $0.imageUrl) }
        stepsLoaded = true
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
            let food = await resolvedFood(id: ing.foodId, embedded: ing.food, foodRepository: foodRepository)
            rows.append(
                IngredientRow(foodId: ing.foodId, food: food, quantity: "\(ing.quantity)", unit: ing.servingUnit)
            )
        }
        return rows
    }

    /// Rows for a source recipe's ingredients scaled by `factor` (see `scaleIngredients`),
    /// food resolved like `resolvedIngredientRows`. Internal so it is testable.
    @MainActor
    static func scaledIngredientRows(
        from source: [RecipeIngredient],
        factor: Double,
        foodRepository: FoodRepository
    ) async -> [IngredientRow] {
        let inputs = source.map { ingredient in
            RecipeIngredientInput(
                foodId: ingredient.foodId,
                quantity: ingredient.quantity,
                servingUnit: ingredient.servingUnit
            )
        }
        var rows: [IngredientRow] = []
        for (original, scaled) in zip(source, scaleIngredients(inputs, factor: factor)) {
            let food = await resolvedFood(id: scaled.foodId, embedded: original.food, foodRepository: foodRepository)
            rows.append(
                IngredientRow(
                    foodId: scaled.foodId,
                    food: food,
                    quantity: "\(scaled.quantity)",
                    unit: scaled.servingUnit
                )
            )
        }
        return rows
    }

    /// The embedded food, else the local cache, else the API. A failed fetch is
    /// reported and leaves the row showing `L10n.unknownIngredient`.
    @MainActor
    private static func resolvedFood(id: String, embedded: Food?, foodRepository: FoodRepository) async -> Food? {
        if let food = embedded ?? foodRepository.food(id: id) { return food }
        do {
            try await foodRepository.refreshFood(id: id)
        } catch {
            ErrorReporter.captureWarning(
                "Ingredient food resolution failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
        }
        return foodRepository.food(id: id)
    }

    /// Appends the scaled copy after the existing rows (never merged into them) and
    /// pops the recipe picker back to the ingredient list.
    private func addFromRecipe(_ source: [RecipeIngredient], factor: Double) async {
        let rows = await Self.scaledIngredientRows(from: source, factor: factor, foodRepository: foodRepository)
        ingredients.append(contentsOf: rows)
        showRecipePicker = false
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

        let stepInputs = Self.stepInputs(from: steps)

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
                // Only when they changed (and were seen): a present list
                // replaces every step, an omitted one leaves them alone.
                if stepsLoaded, stepInputs != originalSteps {
                    update.steps = stepInputs
                }
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
                    cookedWeight: parsedCookedWeight,
                    steps: stepInputs.isEmpty ? nil : stepInputs
                )
                saved = try await recipeRepository.createRecipe(create)
            }
            // Labels live in their own table; only an actual edit is sent,
            // because a user write replaces whatever a labeller seeded.
            if existingRecipe == nil ? !labels.isEmpty : labels != originalLabels {
                saved = try await recipeRepository.setLabels(id: saved.id, labels: labels)
                originalLabels = labels
            }
            // The parent gets the saved recipe either way; only a clean save
            // closes the sheet.
            onSaved(saved)
            // No-ops unless the recipe still has no labels at all, so this
            // never overrides what was just typed above.
            FoodAutoLabeler.labelIfNeeded(
                saved,
                labeler: foodLabeler,
                recipeRepository: recipeRepository,
                foodImageLoader: foodImageLoader
            )
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
    /// Leaves out foods measured in the other dimension (mass vs. volume) — a
    /// food package's new food can only be swapped for one of its own kind.
    var dimension: ServingUnit.Dimension?
    /// False when only the user's own foods make sense as a result: picking an
    /// Open Food Facts hit would create a new food.
    var allowsOpenFoodFacts = true

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
        .accessibilityElement(children: .combine)
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
        results = found.filter { food in
            !excludingIds.contains(food.id) && (dimension == nil || food.servingUnit.dimension == dimension)
        }
        isSearching = false
        guard allowsOpenFoodFacts, found.count < Self.offFallbackThreshold else {
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
