import SwiftUI

struct FoodDetailView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let foodId: String

    @State private var food: Food?
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showEditSheet = false
    @State private var showLogSheet = false
    @State private var showDeleteConfirmation = false
    @State private var isTogglingFavorite = false

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadFood() } }
            } else if let food {
                foodContent(food)
            }
        }
        .navigationTitle(food?.name ?? L10n.foods)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if let food {
                    Button {
                        Task { await toggleFavorite() }
                    } label: {
                        Image(systemName: food.isFavorite ? "star.fill" : "star")
                            .foregroundStyle(food.isFavorite ? .yellow : .secondary)
                    }
                    .disabled(isTogglingFavorite)

                    Menu {
                        Button {
                            showLogSheet = true
                        } label: {
                            Label(L10n.logFood, systemImage: "plus.circle")
                        }

                        Button {
                            showEditSheet = true
                        } label: {
                            Label(L10n.edit, systemImage: "pencil")
                        }

                        Divider()

                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label(L10n.delete, systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .sheet(isPresented: $showEditSheet) {
            if let food {
                FoodEditSheet(food: food) { updated in
                    self.food = updated
                }
            }
        }
        .sheet(isPresented: $showLogSheet) {
            if let food {
                LogFoodSheet(food: food, date: DateFormatting.today)
            }
        }
        .confirmationDialog(L10n.delete, isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button(L10n.delete, role: .destructive) {
                Task { await deleteFood() }
            }
            Button(L10n.cancel, role: .cancel) {}
        }
        .task { await loadFood() }
    }

    private func foodContent(_ food: Food) -> some View {
        List {
            Section {
                if let brand = food.brand {
                    HStack {
                        Text(L10n.brand)
                        Spacer()
                        Text(brand)
                            .foregroundStyle(.secondary)
                    }
                }
                HStack {
                    Text(L10n.servingSize)
                    Spacer()
                    Text("\(Int(food.servingSize)) \(food.servingUnit.displayName)")
                        .foregroundStyle(.secondary)
                }
                if let barcode = food.barcode {
                    HStack {
                        Text(L10n.barcode)
                        Spacer()
                        Text(barcode)
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                }
            }

            Section(L10n.mainMacros) {
                NutrientRow(label: L10n.calories, value: food.calories, unit: "kcal", color: MacroColors.calories)
                NutrientRow(label: L10n.protein, value: food.protein, unit: "g", color: MacroColors.protein)
                NutrientRow(label: L10n.carbs, value: food.carbs, unit: "g", color: MacroColors.carbs)
                NutrientRow(label: L10n.fat, value: food.fat, unit: "g", color: MacroColors.fat)
                NutrientRow(label: L10n.fiber, value: food.fiber, unit: "g", color: MacroColors.fiber)
            }

            NutrientSection(title: L10n.fatBreakdown, nutrients: food.fatBreakdownNutrients)
            NutrientSection(title: L10n.sugarsCarbs, nutrients: food.sugarCarbNutrients)
            NutrientSection(title: L10n.minerals, nutrients: food.mineralNutrients)
            NutrientSection(title: L10n.vitamins, nutrients: food.vitaminNutrients)
            NutrientSection(title: L10n.other, nutrients: food.otherNutrients)

            if let nutriScore = food.nutriScore {
                Section(L10n.quality) {
                    HStack {
                        Text("Nutri-Score")
                        Spacer()
                        Text(nutriScore.uppercased())
                            .fontWeight(.bold)
                            .foregroundStyle(nutriScoreColor(nutriScore))
                    }
                    if let novaGroup = food.novaGroup {
                        HStack {
                            Text("NOVA Group")
                            Spacer()
                            Text("\(novaGroup)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            if let ingredients = food.ingredientsText, !ingredients.isEmpty {
                Section(L10n.ingredients) {
                    Text(ingredients)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func nutriScoreColor(_ score: String) -> Color {
        switch score.lowercased() {
        case "a": return .green
        case "b": return Color(red: 0.5, green: 0.8, blue: 0.2)
        case "c": return .yellow
        case "d": return .orange
        case "e": return .red
        default: return .secondary
        }
    }

    private func toggleFavorite() async {
        guard let food else { return }
        isTogglingFavorite = true
        do {
            self.food = try await api.toggleFavorite(foodId: food.id, isFavorite: !food.isFavorite)
        } catch {}
        isTogglingFavorite = false
    }

    private func loadFood() async {
        isLoading = true
        error = nil
        do {
            food = try await api.getFood(id: foodId)
        } catch {
            self.error = error
        }
        isLoading = false
    }

    private func deleteFood() async {
        do {
            try await api.deleteFood(id: foodId)
            dismiss()
        } catch {}
    }
}
