import SwiftUI

struct RecipeListView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var recipes: [Recipe] = []
    @State private var isLoading = true
    @State private var error: Error?
    @State private var searchQuery = ""
    @State private var showCreateSheet = false
    @State private var loggingRecipe: Recipe?
    @State private var errorMessage: String?

    private var filteredRecipes: [Recipe] {
        guard !searchQuery.isEmpty else { return recipes }
        return recipes.filter { $0.name.localizedCaseInsensitiveContains(searchQuery) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if let error {
                    ErrorView(error: error) { Task { await loadRecipes() } }
                } else if recipes.isEmpty {
                    ContentUnavailableView(
                        L10n.recipes,
                        systemImage: "book.closed",
                        description: Text(L10n.noEntriesYet)
                    )
                } else if filteredRecipes.isEmpty {
                    ContentUnavailableView(
                        L10n.noResults,
                        systemImage: "magnifyingglass",
                        description: Text(searchQuery)
                    )
                } else {
                    List(filteredRecipes) { recipe in
                        NavigationLink(value: recipe) {
                            recipeRow(recipe)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                Task { await deleteRecipe(recipe) }
                            } label: {
                                Label(L10n.delete, systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .leading) {
                            Button {
                                loggingRecipe = recipe
                            } label: {
                                Label(L10n.log, systemImage: "plus.circle")
                            }
                            .tint(.green)
                        }
                    }
                    .listStyle(.plain)
                    .navigationDestination(for: Recipe.self) { recipe in
                        RecipeDetailView(recipeId: recipe.id)
                    }
                }
            }
            .navigationTitle(L10n.recipes)
            .searchable(text: $searchQuery, prompt: L10n.search)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                RecipeEditSheet { _ in
                    Task { await loadRecipes() }
                }
            }
            .sheet(item: $loggingRecipe) { recipe in
                LogRecipeSheet(recipe: recipe) {
                    loggingRecipe = nil
                }
            }
            .refreshable { await loadRecipes() }
            .task { await loadRecipes() }
            .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
    }

    private func recipeRow(_ recipe: Recipe) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(recipe.name)
                    .font(.body)
                if recipe.isFavorite {
                    Image(systemName: "star.fill")
                        .font(.caption)
                        .foregroundStyle(.yellow)
                }
            }
            HStack(spacing: 8) {
                if let cal = recipe.calories {
                    Text("\(Int(cal)) \(L10n.calories.lowercased())/\(L10n.servings.lowercased())")
                        .foregroundStyle(MacroColors.calories)
                }
                Text("\(Int(recipe.totalServings)) \(L10n.servings.lowercased())")
                    .foregroundStyle(.secondary)
            }
            .font(.caption)

            if let ingredients = recipe.ingredients, !ingredients.isEmpty {
                Text(ingredients.compactMap { $0.food?.name }.joined(separator: ", "))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
    }

    private func deleteRecipe(_ recipe: Recipe) async {
        do {
            try await api.deleteRecipe(id: recipe.id)
            recipes.removeAll { $0.id == recipe.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadRecipes() async {
        isLoading = true
        error = nil
        do {
            recipes = try await api.getRecipes()
        } catch {
            self.error = error
        }
        isLoading = false
    }
}

// MARK: - Log Recipe Sheet

struct LogRecipeSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let recipe: Recipe
    let onLogged: () -> Void

    @State private var servings = "1"
    @State private var mealType = "lunch"
    @State private var date = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let mealTypes = ["breakfast", "lunch", "dinner", "snacks"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text(recipe.name)
                            .font(.headline)
                        Spacer()
                        if recipe.isFavorite {
                            Image(systemName: "star.fill")
                                .foregroundStyle(.yellow)
                        }
                    }
                }

                if let cal = recipe.calories {
                    Section(L10n.perServing) {
                        NutrientRow(label: L10n.calories, value: cal / recipe.totalServings, unit: "kcal", color: MacroColors.calories)
                        if let p = recipe.protein {
                            NutrientRow(label: L10n.protein, value: p / recipe.totalServings, unit: "g", color: MacroColors.protein)
                        }
                        if let c = recipe.carbs {
                            NutrientRow(label: L10n.carbs, value: c / recipe.totalServings, unit: "g", color: MacroColors.carbs)
                        }
                        if let f = recipe.fat {
                            NutrientRow(label: L10n.fat, value: f / recipe.totalServings, unit: "g", color: MacroColors.fat)
                        }
                    }
                }

                Section {
                    HStack {
                        Text(L10n.servings)
                        Spacer()
                        TextField("1", text: $servings)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 60)
                    }

                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }

                    DatePicker(L10n.today, selection: $date, displayedComponents: .date)
                }
            }
            .navigationTitle(L10n.log)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.log) {
                        Task { await logRecipe() }
                    }
                    .disabled(isSaving)
                    .fontWeight(.semibold)
                }
            }
            .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
    }

    private func logRecipe() async {
        isSaving = true
        let entry = EntryCreate(
            recipeId: recipe.id,
            mealType: mealType,
            servings: Double(servings) ?? 1,
            date: DateFormatting.isoString(from: date)
        )
        do {
            _ = try await api.createEntry(entry)
            onLogged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
