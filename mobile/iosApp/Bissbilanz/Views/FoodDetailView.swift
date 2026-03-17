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
    @State private var errorMessage: String?
    @State private var ingredientsExpanded = false

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
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
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

            if food.nutriScore != nil || food.novaGroup != nil || !(food.additives?.isEmpty ?? true) || !(food.ingredientsText?.isEmpty ?? true) {
                Section(L10n.quality) {
                    if let nutriScore = food.nutriScore {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(L10n.nutriScore)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            nutriScoreBadge(nutriScore)
                        }
                        .padding(.vertical, 4)
                    }
                    if let novaGroup = food.novaGroup {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(L10n.novaGroup)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            novaGroupBadge(novaGroup)
                        }
                        .padding(.vertical, 4)
                    }
                    if let additives = food.additives, !additives.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 8) {
                                Text(L10n.additives)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Text("\(additives.count)")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(Color.red.opacity(0.15))
                                    .foregroundStyle(.red)
                                    .clipShape(Capsule())
                            }
                            ForEach(additives, id: \.self) { additive in
                                Text(formatAdditive(additive))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    if let ingredients = food.ingredientsText, !ingredients.isEmpty {
                        ingredientsRow(ingredients)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func nutriScoreBadge(_ score: String) -> some View {
        let letters = ["A", "B", "C", "D", "E"]
        let colors: [Color] = [
            Color(red: 0.01, green: 0.51, blue: 0.25),
            Color(red: 0.52, green: 0.73, blue: 0.18),
            Color(red: 1.0, green: 0.80, blue: 0.01),
            Color(red: 0.93, green: 0.51, blue: 0.0),
            Color(red: 0.90, green: 0.24, blue: 0.07),
        ]
        let activeIndex = letters.firstIndex(where: { $0.caseInsensitiveCompare(score) == .orderedSame }) ?? -1

        return HStack(spacing: 4) {
            ForEach(Array(zip(letters.indices, letters)), id: \.0) { index, letter in
                let isActive = index == activeIndex
                Text(letter)
                    .font(isActive ? .body : .caption)
                    .fontWeight(.bold)
                    .foregroundStyle(isActive ? .white : colors[index].opacity(0.5))
                    .frame(width: isActive ? 36 : 28, height: isActive ? 36 : 28)
                    .background(isActive ? colors[index] : colors[index].opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private func novaGroupBadge(_ group: Int) -> some View {
        let info: (String, Color) = switch group {
        case 1: (L10n.novaGroupDescription(1), Color(red: 0.01, green: 0.51, blue: 0.25))
        case 2: (L10n.novaGroupDescription(2), Color(red: 1.0, green: 0.80, blue: 0.01))
        case 3: (L10n.novaGroupDescription(3), Color(red: 0.93, green: 0.51, blue: 0.0))
        case 4: (L10n.novaGroupDescription(4), Color(red: 0.90, green: 0.24, blue: 0.07))
        default: ("", Color.secondary)
        }

        return HStack(spacing: 10) {
            Text("\(group)")
                .font(.body)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(info.1)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            Text(info.0)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(info.1)
        }
    }

    private func formatAdditive(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("en:") { text = String(text.dropFirst(3)) }
        let parts = text.components(separatedBy: " - ")
        if parts.count >= 2 {
            return "\(parts[0].trimmingCharacters(in: .whitespaces).uppercased()) - \(parts[1].trimmingCharacters(in: .whitespaces).capitalized)"
        }
        return text.uppercased()
    }

    private func ingredientsRow(_ text: String) -> some View {
        let isLong = text.count > 150
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(L10n.ingredients)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                if isLong {
                    Image(systemName: ingredientsExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if isLong { withAnimation { ingredientsExpanded.toggle() } }
            }
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(isLong && !ingredientsExpanded ? 3 : nil)
        }
        .padding(.vertical, 4)
    }

    private func toggleFavorite() async {
        guard let food else { return }
        isTogglingFavorite = true
        do {
            self.food = try await api.toggleFavorite(foodId: food.id, isFavorite: !food.isFavorite)
        } catch {
            errorMessage = error.localizedDescription
        }
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
