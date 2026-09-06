import SwiftUI

struct RecipeEditSheet: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(\.dismiss) private var dismiss

    let existingRecipe: Recipe?
    let onSaved: (Recipe) -> Void

    @State private var name = ""
    @State private var totalServings = "1"
    @State private var isFavorite = false
    @State private var ingredients: [IngredientRow] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    struct IngredientRow: Identifiable {
        let id = UUID()
        var food: Food
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

                Section(L10n.ingredients) {
                    ForEach($ingredients) { $ingredient in
                        HStack {
                            Text(ingredient.food.name)
                                .lineLimit(1)
                            Spacer()
                            TextField("1", text: $ingredient.quantity)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                            Picker("", selection: $ingredient.unit) {
                                ForEach(ServingUnit.allCases, id: \.self) { unit in
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
                    .disabled(name.isEmpty || ingredients.isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        guard let recipe = existingRecipe else { return }
        name = recipe.name
        totalServings = "\(recipe.totalServings)"
        isFavorite = recipe.isFavorite
        if let recipeIngredients = recipe.ingredients {
            ingredients = recipeIngredients.compactMap { ing in
                guard let food = ing.food else { return nil }
                return IngredientRow(food: food, quantity: "\(ing.quantity)", unit: ing.servingUnit)
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let ingredientInputs = ingredients.map { ing in
            RecipeIngredientInput(
                foodId: ing.food.id,
                quantity: Double.parseUserInput(ing.quantity) ?? 1,
                servingUnit: ing.unit
            )
        }

        do {
            let saved: Recipe
            if let existing = existingRecipe {
                let update = RecipeUpdate(
                    name: name,
                    totalServings: Double.parseUserInput(totalServings) ?? 1,
                    ingredients: ingredientInputs,
                    isFavorite: isFavorite
                )
                saved = try await recipeRepository.updateRecipe(id: existing.id, update)
            } else {
                let create = RecipeCreate(
                    name: name,
                    totalServings: Double.parseUserInput(totalServings) ?? 1,
                    ingredients: ingredientInputs,
                    isFavorite: isFavorite
                )
                saved = try await recipeRepository.createRecipe(create)
            }
            onSaved(saved)
            dismiss()
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
                            foodRow(name: food.name, detail: detailText(
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
                                        foodRow(name: hit.name, detail: hit.brand ?? "")
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

    private func foodRow(name: String, detail: String) -> some View {
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
            errorMessage = L10n.openFoodFactsAddFailed
        }
    }

    private func search(_ query: String) async {
        guard query.count >= 2 else {
            results = []
            offResults = []
            isSearching = false
            isSearchingOff = false
            return
        }
        isSearching = true
        let found = await foodRepository.searchFoods(query: query)
        guard !Task.isCancelled, query == self.query else { return }
        results = found
        isSearching = false
        guard found.count < Self.offFallbackThreshold else {
            offResults = []
            isSearchingOff = false
            return
        }
        isSearchingOff = true
        offResults = []
        let hits = await foodRepository.searchOpenFoodFacts(query: query)
        guard !Task.isCancelled, query == self.query else { return }
        offResults = hits
        isSearchingOff = false
    }
}
