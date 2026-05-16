import SwiftUI

struct FavoritesView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var favoriteFoods: [Food] = []
    @State private var favoriteRecipes: [Recipe] = []
    @State private var isLoading = true
    @State private var selectedTab = 0
    @State private var selectedFood: Food?
    @State private var selectedRecipe: Recipe?
    @State private var toastMessage: String?
    @State private var preferences: Preferences = .defaults
    @State private var pendingFood: Food?
    @State private var pendingRecipe: Recipe?
    @State private var showMealPicker = false

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $selectedTab) {
                    Text("\(L10n.foods) (\(favoriteFoods.count))").tag(0)
                    Text("\(L10n.recipes) (\(favoriteRecipes.count))").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 8)

                if isLoading {
                    LoadingView()
                } else {
                    switch selectedTab {
                    case 0:
                        foodsTab
                    case 1:
                        recipesTab
                    default:
                        EmptyView()
                    }
                }
            }
            .navigationTitle(L10n.favorites)
            .refreshable { await loadAll() }
            .toast(message: $toastMessage)
            .sheet(item: $selectedFood) { food in
                LogFoodSheet(food: food, date: DateFormatting.today)
            }
            .sheet(item: $selectedRecipe) { recipe in
                LogRecipeSheet(recipe: recipe) {
                    Task { await loadAll() }
                }
            }
            .task { await loadAll() }
            .sheet(isPresented: $showMealPicker, onDismiss: {
                pendingFood = nil
                pendingRecipe = nil
            }) {
                MealPickerSheet { mealName in
                    if let food = pendingFood {
                        Task { await quickLogFood(food, meal: mealName) }
                    } else if let recipe = pendingRecipe {
                        Task { await quickLogRecipe(recipe, meal: mealName) }
                    }
                }
            }
        }
    }

    private var foodsTab: some View {
        Group {
            if favoriteFoods.isEmpty {
                ContentUnavailableView(
                    L10n.noFavorites,
                    systemImage: "star",
                    description: Text(L10n.markFavoritesHint)
                )
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(favoriteFoods) { food in
                            FavoriteCard(
                                name: food.name,
                                brand: food.brand,
                                calories: Int(food.calories),
                                protein: Int(food.protein),
                                onTap: {
                                    selectedFood = food
                                },
                                onQuickLog: {
                                    quickLog(food: food)
                                }
                            )
                        }
                    }
                    .padding()
                }
            }
        }
    }

    private var recipesTab: some View {
        Group {
            if favoriteRecipes.isEmpty {
                ContentUnavailableView(
                    L10n.noFavorites,
                    systemImage: "star",
                    description: Text(L10n.markRecipeFavoritesHint)
                )
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(favoriteRecipes) { recipe in
                            FavoriteCard(
                                name: recipe.name,
                                brand: nil,
                                calories: recipe.calories.map { Int($0) } ?? 0,
                                protein: recipe.protein.map { Int($0) } ?? 0,
                                onTap: {
                                    selectedRecipe = recipe
                                },
                                onQuickLog: {
                                    quickLog(recipe: recipe)
                                }
                            )
                        }
                    }
                    .padding()
                }
            }
        }
    }

    private func mealForCurrentTime() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<11: return "breakfast"
        case 11..<14: return "lunch"
        case 14..<17: return "snacks"
        default: return "dinner"
        }
    }

    private func quickLog(food: Food) {
        if preferences.favoriteMealAssignmentMode == "ask_meal" {
            pendingFood = food
            showMealPicker = true
        } else {
            Task { await quickLogFood(food, meal: mealForCurrentTime()) }
        }
    }

    private func quickLog(recipe: Recipe) {
        if preferences.favoriteMealAssignmentMode == "ask_meal" {
            pendingRecipe = recipe
            showMealPicker = true
        } else {
            Task { await quickLogRecipe(recipe, meal: mealForCurrentTime()) }
        }
    }

    private func quickLogFood(_ food: Food, meal: String) async {
        let entry = EntryCreate(
            foodId: food.id,
            mealType: meal,
            servings: 1,
            date: DateFormatting.today
        )
        do {
            _ = try await api.createEntry(entry)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = "\(food.name) \(L10n.logged)"
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToLog
        }
    }

    private func quickLogRecipe(_ recipe: Recipe, meal: String) async {
        let entry = EntryCreate(
            recipeId: recipe.id,
            mealType: meal,
            servings: 1,
            date: DateFormatting.today
        )
        do {
            _ = try await api.createEntry(entry)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = "\(recipe.name) \(L10n.logged)"
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToLog
        }
    }

    private func loadAll() async {
        isLoading = true
        async let favs = api.getFavorites()
        async let prefs = api.getPreferences()
        do {
            let response = try await favs
            favoriteFoods = response.foods
            favoriteRecipes = response.recipes ?? []
        } catch {
            favoriteFoods = []
            favoriteRecipes = []
        }
        if let p = try? await prefs { preferences = p }
        isLoading = false
    }
}

struct FavoriteCard: View {
    let name: String
    let brand: String?
    let calories: Int
    let protein: Int
    let onTap: () -> Void
    var onQuickLog: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .foregroundStyle(.primary)

                    if let brand {
                        Text(brand)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)

                    HStack {
                        Text("\(calories) cal")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundStyle(MacroColors.calories)
                        Spacer()
                        Text("P\(protein)")
                            .font(.caption2)
                            .foregroundStyle(MacroColors.protein)
                    }
                }
            }
            .buttonStyle(.plain)

            if let onQuickLog {
                Button(action: onQuickLog) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.caption2)
                        Text(L10n.quickLog)
                            .font(.caption2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.accentColor.opacity(0.12))
                    .foregroundStyle(Color.accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// LogRecipeSheet is defined in RecipeListView.swift
