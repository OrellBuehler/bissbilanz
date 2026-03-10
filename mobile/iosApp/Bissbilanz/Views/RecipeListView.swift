import SwiftUI

struct RecipeListView: View {
    @EnvironmentObject var api: BissbilanzAPI

    @State private var recipes: [Recipe] = []
    @State private var isLoading = true
    @State private var error: Error?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if let error {
                    ErrorView(error: error) { Task { await loadRecipes() } }
                } else if recipes.isEmpty {
                    ContentUnavailableView(
                        "No recipes",
                        systemImage: "book.closed",
                        description: Text("Create recipes on the web app")
                    )
                } else {
                    List(recipes) { recipe in
                        NavigationLink(value: recipe) {
                            recipeRow(recipe)
                        }
                    }
                    .listStyle(.plain)
                    .navigationDestination(for: Recipe.self) { recipe in
                        RecipeDetailView(recipeId: recipe.id)
                    }
                }
            }
            .navigationTitle("Recipes")
            .refreshable { await loadRecipes() }
            .task { await loadRecipes() }
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
                    Text("\(Int(cal)) cal/serving")
                        .foregroundStyle(MacroColors.calories)
                }
                Text("\(Int(recipe.totalServings)) servings")
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
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
