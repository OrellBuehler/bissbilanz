import SwiftUI

enum RecipeSort: String, CaseIterable, Identifiable {
    case name
    case recentlyUpdated
    case caloriesPerServing

    var id: String { rawValue }

    var label: String {
        switch self {
        case .name: L10n.name
        case .recentlyUpdated: L10n.sortRecentlyUpdated
        case .caloriesPerServing: L10n.sortCaloriesPerServing
        }
    }
}

struct RecipeListView: View {
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    @State private var recipes: [Recipe] = []
    @State private var isLoading = true
    @State private var error: Error?
    @State private var searchQuery = ""
    @State private var sortBy: RecipeSort = .name
    @State private var showCreateSheet = false
    @State private var loggingRecipe: Recipe?
    @State private var duplicatedRecipe: Recipe?
    @State private var errorMessage: String?
    @State private var deleteConflict: (recipe: Recipe, conflict: DeleteConflict)?

    private var filteredRecipes: [Recipe] {
        let matching = searchQuery.isEmpty
            ? recipes
            : recipes.filter { $0.name.localizedCaseInsensitiveContains(searchQuery) }
        switch sortBy {
        case .name:
            return matching.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case .recentlyUpdated:
            return matching.sorted { ($0.updatedAt ?? $0.createdAt ?? "") > ($1.updatedAt ?? $1.createdAt ?? "") }
        case .caloriesPerServing:
            return matching.sorted { ($0.caloriesPerServing ?? 0) < ($1.caloriesPerServing ?? 0) }
        }
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
                        // Label-based link: the
                        // `navigationDestination(for: Recipe.self)` it replaces sat
                        // on this branch of the conditional only, so an empty search
                        // result or a reload error while a recipe was pushed left the
                        // stack with nothing to resolve — the empty placeholder page.
                        NavigationLink {
                            RecipeDetailView(recipeId: recipe.id)
                        } label: {
                            recipeRow(recipe)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                Task { await deleteRecipe(recipe) }
                            } label: {
                                Label(L10n.delete, systemImage: "trash")
                            }
                            Button {
                                Task { await duplicateRecipe(recipe) }
                            } label: {
                                Label(L10n.duplicateRecipe, systemImage: "doc.on.doc")
                            }
                            .tint(.blue)
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
                    .accessibilityLabel(L10n.createRecipe)
                }
                ToolbarItem(placement: .secondaryAction) {
                    Menu {
                        Picker(L10n.sortBy, selection: $sortBy) {
                            ForEach(RecipeSort.allCases) { sort in
                                Text(sort.label).tag(sort)
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                    .accessibilityLabel(L10n.sortBy)
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
            .sheet(item: $duplicatedRecipe) { copy in
                RecipeEditSheet(recipe: copy) { _ in
                    Task { await loadRecipes() }
                }
            }
            .refreshable { await loadRecipes() }
            .task { await loadRecipes() }
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
            .alert(
                L10n.stillInUse,
                isPresented: .init(get: { deleteConflict != nil }, set: { if !$0 { deleteConflict = nil } })
            ) {
                Button(L10n.deleteAnyway, role: .destructive) {
                    if let recipe = deleteConflict?.recipe {
                        deleteConflict = nil
                        Task { await forceDeleteRecipe(recipe) }
                    }
                }
                Button(L10n.cancel, role: .cancel) { deleteConflict = nil }
            } message: {
                if let deleteConflict { Text(deleteConflict.conflict.message) }
            }
        }
    }

    private func recipeRow(_ recipe: Recipe) -> some View {
        HStack(spacing: 12) {
            // Same 40 pt leading thumbnail as the food search rows, and the
            // same rule: no image means no reserved space.
            if recipe.imageUrl != nil {
                FoodImageView(imageUrl: recipe.imageUrl)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)
            }
            recipeRowText(recipe)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(recipeAccessibilityLabel(recipe))
    }

    private func recipeRowText(_ recipe: Recipe) -> some View {
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
                if let cal = recipe.caloriesPerServing {
                    Text("\(Int(cal)) \(L10n.calories.lowercased())/\(L10n.servings.lowercased())")
                        .foregroundStyle(accessibleColor(.calories))
                }
                Text("\(Int(recipe.totalServings)) \(L10n.servings.lowercased())")
                    .foregroundStyle(.secondary)
            }
            .font(.caption)

            if let ingredients = recipe.ingredients, !ingredients.isEmpty {
                // The server response has no embedded `food` on ingredients — fall
                // back to the local cache (no network round trip, this runs once
                // per row) instead of silently showing nothing for a synced recipe.
                let names = ingredients.compactMap { $0.food?.name ?? foodRepository.food(id: $0.foodId)?.name }
                Text(names.joined(separator: ", "))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
    }

    private func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    private func recipeAccessibilityLabel(_ recipe: Recipe) -> String {
        var parts = [recipe.name]
        if recipe.isFavorite { parts.append(L10n.favorite) }
        if let cal = recipe.caloriesPerServing {
            parts.append(L10n.caloriesAmount(Int(cal)) + "/\(L10n.servings.lowercased())")
        }
        parts.append("\(Int(recipe.totalServings)) \(L10n.servings.lowercased())")
        return parts.joined(separator: ", ")
    }

    private func deleteRecipe(_ recipe: Recipe) async {
        do {
            switch try await recipeRepository.deleteRecipeChecked(id: recipe.id) {
            case .deleted:
                break
            case let .blocked(conflict):
                deleteConflict = (recipe, conflict)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        recipes = recipeRepository.recipes()
    }

    private func forceDeleteRecipe(_ recipe: Recipe) async {
        do {
            try await recipeRepository.forceDeleteRecipe(id: recipe.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        recipes = recipeRepository.recipes()
    }

    /// Copies the recipe under a new name and opens the copy in the editor —
    /// see `RecipeRepository.duplicateRecipe` for why the image is never copied.
    private func duplicateRecipe(_ recipe: Recipe) async {
        do {
            duplicatedRecipe = try await recipeRepository.duplicateRecipe(
                id: recipe.id,
                name: L10n.recipeCopyName(recipe.name)
            )
        } catch {
            ErrorReporter.captureWarning("Recipe duplicate failed", context: ["reason": ErrorReporter.reason(for: error)])
            errorMessage = L10n.duplicateRecipeFailed
        }
    }

    private func loadRecipes() async {
        recipes = recipeRepository.recipes()
        isLoading = recipes.isEmpty
        error = nil
        do {
            try await recipeRepository.refresh()
            recipes = recipeRepository.recipes()
        } catch {
            if recipes.isEmpty { self.error = error }
        }
        isLoading = false
    }
}

// MARK: - Log Recipe Sheet

struct LogRecipeSheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    let recipe: Recipe
    let onLogged: () -> Void

    @State private var servings: String
    @State private var gramsText: String
    @State private var logByWeight = false
    @State private var mealType: String
    @State private var date = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    /// Grams per serving implied by the recipe's cooked weight, if any — offers
    /// "log by grams" as an alternative to servings.
    private var gramsPerServing: Double? { recipe.cookedWeightServingSize }

    /// `initialServings`/`initialMealType` let a suggestion (recipe suggestions
    /// screen/card) prefill the form with its scaled portion and time-of-day
    /// meal instead of the plain "1 serving, Lunch" default.
    init(
        recipe: Recipe,
        initialServings: Double? = nil,
        initialMealType: String? = nil,
        onLogged: @escaping () -> Void
    ) {
        self.recipe = recipe
        self.onLogged = onLogged
        let servingsValue = initialServings ?? 1
        _servings = State(initialValue: MacroFormat.servings(servingsValue))
        _gramsText = State(
            initialValue: recipe.cookedWeightServingSize.map { MacroFormat.servings($0 * servingsValue) } ?? ""
        )
        _mealType = State(initialValue: initialMealType ?? "Lunch")
    }

    private func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    /// Servings to log, resolved from whichever field is active.
    private var resolvedServings: Double {
        guard logByWeight, let gramsPerServing, gramsPerServing > 0 else {
            return Double.parseUserInput(servings) ?? 1
        }
        return (Double.parseUserInput(gramsText) ?? 0) / gramsPerServing
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FoodHeaderImage(imageUrl: recipe.imageUrl)
                        .accessibilityHidden(true)
                    HStack {
                        Text(recipe.name)
                            .font(.headline)
                        Spacer()
                        if recipe.isFavorite {
                            Image(systemName: "star.fill")
                                .foregroundStyle(.yellow)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }

                if let cal = recipe.caloriesPerServing {
                    Section(L10n.perServing) {
                        NutrientRow(
                            label: L10n.calories,
                            value: cal,
                            unit: "kcal",
                            color: accessibleColor(.calories)
                        )
                        if let p = recipe.proteinPerServing {
                            NutrientRow(
                                label: L10n.protein,
                                value: p,
                                unit: "g",
                                color: accessibleColor(.protein)
                            )
                        }
                        if let c = recipe.carbsPerServing {
                            NutrientRow(
                                label: L10n.carbs,
                                value: c,
                                unit: "g",
                                color: accessibleColor(.carbs)
                            )
                        }
                        if let f = recipe.fatPerServing {
                            NutrientRow(
                                label: L10n.fat,
                                value: f,
                                unit: "g",
                                color: accessibleColor(.fat)
                            )
                        }
                    }
                }

                Section {
                    if gramsPerServing != nil {
                        Picker("", selection: $logByWeight) {
                            Text(L10n.logByServings).tag(false)
                            Text(L10n.logByWeight).tag(true)
                        }
                        .pickerStyle(.segmented)
                    }

                    if logByWeight, gramsPerServing != nil {
                        HStack {
                            Text(L10n.gramsEaten)
                            Spacer()
                            TextField("0", text: $gramsText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                                .accessibilityLabel(L10n.gramsEaten)
                        }
                    } else {
                        HStack {
                            Text(L10n.servings)
                            Spacer()
                            TextField("1", text: $servings)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                                .accessibilityLabel(L10n.servings)
                        }
                    }

                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }

                    DatePicker(L10n.today, selection: $date, displayedComponents: .date)
                }
            }
            .keyboardDismissable()
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
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
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
            servings: resolvedServings,
            date: DateFormatting.isoString(from: date)
        )
        do {
            try await entryRepository.createEntry(entry, recipe: recipe)
            onLogged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
