import SwiftUI

struct FavoritesView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var favoriteFoods: [Food] = []
    @State private var favoriteRecipes: [Recipe] = []
    @State private var isLoading = true
    @State private var selectedTab = 0
    @State private var selectedFood: Food?
    @State private var selectedRecipe: Recipe?

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $selectedTab) {
                    Text(L10n.foods).tag(0)
                    Text(L10n.recipes).tag(1)
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
            .refreshable { await loadFavorites() }
            .sheet(item: $selectedFood) { food in
                LogFoodSheet(food: food, date: DateFormatting.today)
            }
            .sheet(item: $selectedRecipe) { recipe in
                LogRecipeSheet(recipe: recipe) {
                    Task { await loadFavorites() }
                }
            }
            .task { await loadFavorites() }
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
                                protein: Int(food.protein)
                            ) {
                                selectedFood = food
                            }
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
                                protein: recipe.protein.map { Int($0) } ?? 0
                            ) {
                                selectedRecipe = recipe
                            }
                        }
                    }
                    .padding()
                }
            }
        }
    }

    private func loadFavorites() async {
        isLoading = true
        do {
            let response = try await api.getFavorites()
            favoriteFoods = response.foods
            favoriteRecipes = response.recipes ?? []
        } catch {
            favoriteFoods = []
            favoriteRecipes = []
        }
        isLoading = false
    }
}

struct FavoriteCard: View {
    let name: String
    let brand: String?
    let calories: Int
    let protein: Int
    let onTap: () -> Void

    var body: some View {
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
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// LogRecipeSheet is defined in RecipeListView.swift
