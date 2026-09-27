import SwiftUI
import TipKit

struct FoodDetailView: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(AppModeManager.self) private var appMode
    @Environment(\.dismiss) private var dismiss

    let foodId: String
    /// Forwarded to `LogFoodSheet` — set by flows (barcode scanner) that
    /// should collapse entirely once a log succeeds.
    var onLogged: (() -> Void)?

    @State private var food: Food?
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showEditSheet = false
    @State private var showLogSheet = false
    @State private var showDeleteConfirmation = false
    @State private var isTogglingFavorite = false
    @State private var isEnriching = false
    @State private var errorMessage: String?
    @State private var toastMessage: String?
    @State private var showTipHelp = false
    private let favoritesLoggingTip = FavoritesLoggingTip()
    @State private var deleteConflict: DeleteConflict?
    @State private var showMergePicker = false
    /// Picked in the merge picker; turned into `mergeCandidates` once that
    /// sheet is gone, since two sheets can't be up at once.
    @State private var mergeTarget: Food?
    @State private var mergeCandidates: FoodMergeCandidates?

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
        .safeAreaInset(edge: .bottom) {
            if food != nil, !isLoading, error == nil {
                Button {
                    showLogSheet = true
                } label: {
                    Label(L10n.logFood, systemImage: "plus.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal)
                .padding(.bottom, 8)
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
                            .contentTransition(.symbolEffect(.replace))
                            .symbolEffect(.bounce, value: food.isFavorite)
                    }
                    .disabled(isTogglingFavorite)
                    .accessibilityLabel(food.isFavorite ? L10n.removeFromFavorites : L10n.addToFavorites)
                    .popoverTip(favoritesLoggingTip) { action in
                        guard action.id == "learn_more" else { return }
                        showTipHelp = true
                    }

                    Menu {
                        Button {
                            showEditSheet = true
                        } label: {
                            Label(L10n.edit, systemImage: "pencil")
                        }

                        // Only a barcode gives Open Food Facts something to
                        // look the product up by.
                        if let barcode = food.barcode, !barcode.isEmpty {
                            Button {
                                Task { await enrich(barcode: barcode) }
                            } label: {
                                Label(L10n.enrichFromOpenFoodFacts, systemImage: "wand.and.stars")
                            }
                            .disabled(isEnriching)
                        }

                        // Merging requires an account — there is no server to
                        // merge on in Local mode, same as every other
                        // account-only action (mirrors AIMealSheet's
                        // `!appMode.isLocal` gating).
                        if !appMode.isLocal {
                            Button {
                                showMergePicker = true
                            } label: {
                                Label(L10n.foodsMerge, systemImage: "arrow.triangle.merge")
                            }
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
                    .accessibilityLabel(L10n.more)
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
                LogFoodSheet(food: food, date: DateFormatting.today, onLogged: onLogged)
            }
        }
        .sheet(isPresented: $showMergePicker, onDismiss: {
            if let target = mergeTarget, let food {
                mergeCandidates = FoodMergeCandidates(foods: [target, food], keeperId: target.id)
            }
            mergeTarget = nil
        }) {
            NavigationStack {
                FoodPicker(onPicked: { picked in mergeTarget = picked }, excludingIds: [foodId])
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(L10n.cancel) { showMergePicker = false }
                    }
                }
            }
        }
        .confirmationDialog(L10n.delete, isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button(L10n.delete, role: .destructive) {
                Task { await deleteFood() }
            }
            Button(L10n.cancel, role: .cancel) {}
        }
        .sheet(item: $mergeCandidates) { candidates in
            FoodMergeSheet(candidates: candidates) { merged in
                // Kept this food: stay and show the merged values. Merged it
                // away: it no longer exists, so go back to the list.
                if merged.id == foodId {
                    food = merged
                    toastMessage = L10n.foodsMergeSuccess
                } else {
                    dismiss()
                }
            }
        }
        .sheet(isPresented: $showTipHelp) {
            SafariView(url: HelpLink.url(for: .logging))
        }
        .task { await loadFood() }
        .toast(message: $toastMessage)
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
        .alert(
            L10n.stillInUse,
            isPresented: .init(get: { deleteConflict != nil }, set: { if !$0 { deleteConflict = nil } })
        ) {
            Button(L10n.deleteAnyway, role: .destructive) {
                deleteConflict = nil
                Task { await forceDeleteFood() }
            }
            Button(L10n.cancel, role: .cancel) { deleteConflict = nil }
        } message: {
            if let deleteConflict { Text(deleteConflict.message) }
        }
    }

    private func foodContent(_ food: Food) -> some View {
        List {
            if food.imageUrl != nil {
                Section {
                    FoodImageView(imageUrl: food.imageUrl)
                        .frame(width: 200, height: 200)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .frame(maxWidth: .infinity)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .accessibilityHidden(true)
                }
            }

            Section {
                if let brand = food.brand {
                    HStack {
                        Text(L10n.brand)
                        Spacer()
                        Text(brand)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
                HStack {
                    Text(L10n.servingSize)
                    Spacer()
                    Text("\(Int(food.servingSize)) \(food.servingUnit.displayName)")
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                if let barcode = food.barcode {
                    HStack {
                        Text(L10n.barcode)
                        Spacer()
                        Text(barcode)
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                    .accessibilityElement(children: .combine)
                }
            }

            Section(L10n.mainMacros) {
                NutrientRow(label: L10n.calories, value: food.calories, unit: "kcal")
                NutrientRow(label: L10n.protein, value: food.protein, unit: "g")
                NutrientRow(label: L10n.carbs, value: food.carbs, unit: "g")
                NutrientRow(label: L10n.fat, value: food.fat, unit: "g")
                NutrientRow(label: L10n.fiber, value: food.fiber, unit: "g")
            }

            NutrientSection(title: L10n.fatBreakdown, nutrients: food.fatBreakdownNutrients)
            NutrientSection(title: L10n.sugarsCarbs, nutrients: food.sugarCarbNutrients)
            NutrientSection(title: L10n.minerals, nutrients: food.mineralNutrients)
            NutrientSection(title: L10n.vitamins, nutrients: food.vitaminNutrients)
            NutrientSection(title: L10n.other, nutrients: food.otherNutrients)

            FoodQualitySection(food: food)
        }
        .listStyle(.insetGrouped)
    }

    private func toggleFavorite() async {
        guard let food else { return }
        isTogglingFavorite = true
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        do {
            self.food = try await foodRepository.toggleFavorite(foodId: food.id, isFavorite: !food.isFavorite)
        } catch {
            errorMessage = error.localizedDescription
            // The optimistic local flip persisted — keep the view in sync with it.
            self.food = foodRepository.food(id: food.id) ?? food
        }
        isTogglingFavorite = false
    }

    /// Overlays the Open Food Facts product for this barcode onto the stored
    /// food. Nothing is lost on failure — the write only happens once the
    /// lookup succeeded.
    private func enrich(barcode: String) async {
        guard !isEnriching else { return }
        isEnriching = true
        defer { isEnriching = false }
        do {
            food = try await foodRepository.enrichFood(id: foodId, barcode: barcode)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = L10n.enrichSuccess
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.enrichFailed
        }
    }

    private func loadFood() async {
        food = foodRepository.food(id: foodId)
        isLoading = food == nil
        error = nil
        do {
            try await foodRepository.refreshFood(id: foodId)
            food = foodRepository.food(id: foodId) ?? food
        } catch {
            if food == nil { self.error = error }
        }
        isLoading = false
    }

    private func deleteFood() async {
        do {
            switch try await foodRepository.deleteFoodChecked(id: foodId) {
            case .deleted:
                dismiss()
            case let .blocked(conflict):
                deleteConflict = conflict
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func forceDeleteFood() async {
        do {
            try await foodRepository.forceDeleteFood(id: foodId)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
