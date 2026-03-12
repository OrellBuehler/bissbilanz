import SwiftUI

struct RecipeEditSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let existingRecipe: Recipe?
    let onSaved: (Recipe) -> Void

    @State private var name = ""
    @State private var totalServings = "1"
    @State private var isFavorite = false
    @State private var ingredients: [IngredientRow] = []
    @State private var showFoodPicker = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var availableFoods: [Food] = []

    struct IngredientRow: Identifiable {
        let id = UUID()
        var food: Food
        var quantity: String
        var unit: ServingUnit
    }

    init(recipe: Recipe? = nil, onSaved: @escaping (Recipe) -> Void = { _ in }) {
        self.existingRecipe = recipe
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Recipe Name", text: $name)
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

                    Button {
                        showFoodPicker = true
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
            .sheet(isPresented: $showFoodPicker) {
                FoodPickerSheet { food in
                    ingredients.append(IngredientRow(food: food, quantity: "\(food.servingSize)", unit: food.servingUnit))
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
                quantity: Double(ing.quantity) ?? 1,
                servingUnit: ing.unit
            )
        }

        do {
            let saved: Recipe
            if let existing = existingRecipe {
                let update = RecipeUpdate(
                    name: name,
                    totalServings: Double(totalServings) ?? 1,
                    ingredients: ingredientInputs,
                    isFavorite: isFavorite
                )
                saved = try await api.updateRecipe(id: existing.id, update)
            } else {
                let create = RecipeCreate(
                    name: name,
                    totalServings: Double(totalServings) ?? 1,
                    ingredients: ingredientInputs,
                    isFavorite: isFavorite
                )
                saved = try await api.createRecipe(create)
            }
            onSaved(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

// Helper sheet for picking a food to add as ingredient
struct FoodPickerSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let onPicked: (Food) -> Void

    @State private var query = ""
    @State private var results: [Food] = []
    @State private var isSearching = false

    var body: some View {
        NavigationStack {
            Group {
                if query.count < 2 {
                    ContentUnavailableView(L10n.search, systemImage: "magnifyingglass", description: Text("Type at least 2 characters"))
                } else if isSearching {
                    LoadingView()
                } else if results.isEmpty {
                    ContentUnavailableView(L10n.noResults, systemImage: "magnifyingglass")
                } else {
                    List(results) { food in
                        Button {
                            onPicked(food)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(food.name)
                                    .foregroundStyle(.primary)
                                Text("\(Int(food.calories)) cal \u{00B7} \(food.servingSize, specifier: "%.0f") \(food.servingUnit.displayName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Select Food")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: L10n.searchFoods)
            .onChange(of: query) { _, newValue in
                Task { await search(newValue) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
        }
    }

    private func search(_ query: String) async {
        guard query.count >= 2 else { results = []; return }
        isSearching = true
        results = (try? await api.searchFoods(query: query)) ?? []
        isSearching = false
    }
}
