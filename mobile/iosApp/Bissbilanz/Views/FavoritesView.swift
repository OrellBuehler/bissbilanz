import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject var api: BissbilanzAPI

    @State private var favorites: [Food] = []
    @State private var isLoading = true
    @State private var selectedFood: Food?

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if favorites.isEmpty {
                    ContentUnavailableView(
                        "No favorites",
                        systemImage: "star",
                        description: Text("Mark foods as favorites to see them here")
                    )
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(favorites) { food in
                                FavoriteCard(food: food) {
                                    selectedFood = food
                                }
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Favorites")
            .refreshable { await loadFavorites() }
            .sheet(item: $selectedFood) { food in
                LogFoodSheet(food: food, date: todayString())
            }
            .task { await loadFavorites() }
        }
    }

    private func loadFavorites() async {
        isLoading = true
        do {
            favorites = try await api.getFavorites()
        } catch {
            favorites = []
        }
        isLoading = false
    }

    private func todayString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}

struct FavoriteCard: View {
    let food: Food
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                Text(food.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(.primary)

                if let brand = food.brand {
                    Text(brand)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                HStack {
                    Text("\(Int(food.calories)) cal")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(MacroColors.calories)
                    Spacer()
                    Text("P\(Int(food.protein))")
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
