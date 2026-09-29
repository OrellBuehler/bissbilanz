import SwiftUI

/// Full-screen cooking mode for a recipe: an ingredients checklist, then one
/// page per step, then a closing page. Swipe between pages or use Back/Next
/// (the buttons are what VoiceOver and Switch Control users drive).
///
/// The screen stays awake while it is open — hands are usually busy — and the
/// previous idle-timer setting is put back when it goes away. Everything reads
/// from the recipe it was given, so it works offline from the local cache; step
/// photos come through `FoodImageLoader`, which serves them from disk once seen.
struct RecipeCookingView: View {
    let recipe: Recipe
    /// Ingredient names resolved by the detail screen (the server never embeds
    /// `food` on an ingredient); falls back to the embedded food, then to
    /// `L10n.unknownIngredient`.
    var foodNames: [String: String] = [:]

    @Environment(\.dismiss) private var dismiss

    @State private var page = 0
    @State private var checked: Set<Int> = []
    @State private var servings: Double
    @State private var holdsIdleTimer = false
    @State private var previousIdleTimerDisabled = false
    @State private var showLogSheet = false
    @State private var didLog = false
    @State private var zoomedPhoto: ZoomedPhoto?

    private struct ZoomedPhoto: Identifiable {
        let url: String
        var id: String { url }
    }

    init(recipe: Recipe, foodNames: [String: String] = [:]) {
        self.recipe = recipe
        self.foodNames = foodNames
        _servings = State(initialValue: recipe.totalServings > 0 ? recipe.totalServings : 1)
    }

    // MARK: - Pages

    private var steps: [RecipeStep] { recipe.orderedSteps }

    private var ingredients: [RecipeIngredient] {
        (recipe.ingredients ?? []).sorted { $0.sortOrder < $1.sortOrder }
    }

    /// A recipe whose ingredients aren't cached (a summary copy opened offline)
    /// goes straight to its steps instead of showing an empty checklist.
    private var hasIngredientsPage: Bool { !ingredients.isEmpty }
    private var stepOffset: Int { hasIngredientsPage ? 1 : 0 }
    private var lastPage: Int { stepOffset + steps.count }

    private var isOnIngredients: Bool { hasIngredientsPage && page == 0 }
    private var isOnDonePage: Bool { page == lastPage }
    private var currentStepNumber: Int { page - stepOffset + 1 }

    private var headerTitle: String {
        if isOnDonePage { return L10n.cookingAllDone }
        if isOnIngredients { return L10n.ingredients }
        return L10n.cookingStepOf(currentStepNumber, of: steps.count)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            TabView(selection: $page) {
                if hasIngredientsPage {
                    ingredientsPage.tag(0)
                }
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    stepPage(step, number: index + 1).tag(stepOffset + index)
                }
                donePage.tag(lastPage)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            controls
        }
        .background(Color(.systemBackground))
        .onAppear(perform: holdScreenAwake)
        .onDisappear(perform: releaseScreen)
        .onChange(of: page) { _, _ in
            AccessibilityNotification.Announcement(spokenSummary).post()
        }
        .sheet(isPresented: $showLogSheet, onDismiss: {
            if didLog { dismiss() }
        }) {
            LogRecipeSheet(recipe: recipe) {
                didLog = true
                showLogSheet = false
            }
        }
        .fullScreenCover(item: $zoomedPhoto) { photo in
            AiTaskImageViewer(imageUrls: [photo.url], initialIndex: 0) {
                zoomedPhoto = nil
            }
        }
    }

    // MARK: - Chrome

    private var header: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.title3.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(L10n.close)

                Spacer()

                Text(headerTitle)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)

                Spacer()

                // Balances the close button so the title stays centred.
                Color.clear.frame(width: 44, height: 44)
            }

            ProgressView(value: Double(page), total: Double(max(lastPage, 1)))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                move(by: -1)
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.left").accessibilityHidden(true)
                    Text(L10n.cookingBack)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(page == 0)

            Button {
                if isOnDonePage {
                    dismiss()
                } else {
                    move(by: 1)
                }
            } label: {
                HStack(spacing: 6) {
                    Text(isOnDonePage ? L10n.cookingFinish : L10n.cookingNext)
                    Image(systemName: isOnDonePage ? "checkmark" : "chevron.right").accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func move(by delta: Int) {
        withAnimation {
            page = min(max(page + delta, 0), lastPage)
        }
    }

    // MARK: - Ingredients

    private var ingredientsPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Stepper(value: $servings, in: 0.5 ... 99, step: 0.5) {
                    Text("\(L10n.servings): \(Self.formattedQuantity(servings))")
                        .font(.title3.weight(.semibold))
                }
                .padding(.bottom, 4)

                Text(
                    "\(L10n.cookingIngredientsHint) \(L10n.cookingIngredientsReady(checked.count, of: ingredients.count))"
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.bottom, 12)

                ForEach(Array(ingredients.enumerated()), id: \.offset) { index, ingredient in
                    ingredientRow(ingredient, index: index)
                    if index < ingredients.count - 1 {
                        Divider()
                    }
                }
            }
            .padding(20)
        }
    }

    private func ingredientRow(_ ingredient: RecipeIngredient, index: Int) -> some View {
        let isChecked = checked.contains(index)
        let name = ingredient.food?.name ?? foodNames[ingredient.foodId] ?? L10n.unknownIngredient
        let quantity = Self.scaledQuantity(ingredient.quantity, servings: servings, baseServings: recipe.totalServings)
        return Button {
            if isChecked {
                checked.remove(index)
            } else {
                checked.insert(index)
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(isChecked ? Color.accentColor : Color.secondary)
                    .accessibilityHidden(true)
                Text(name)
                    .font(.title3)
                    .strikethrough(isChecked)
                    .foregroundStyle(isChecked ? Color.secondary : Color.primary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Text("\(Self.formattedQuantity(quantity)) \(ingredient.servingUnit.displayName)")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isChecked ? .isSelected : [])
    }

    /// An ingredient's amount for `servings` portions of a recipe written for
    /// `baseServings`. A non-positive base is treated as one, like the macro maths.
    static func scaledQuantity(_ quantity: Double, servings: Double, baseServings: Double) -> Double {
        quantity * servings / (baseServings > 0 ? baseServings : 1)
    }

    /// Up to two decimals, locale-aware, without trailing zeros ("0.75", "2").
    static func formattedQuantity(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0 ... 2)))
    }

    // MARK: - Steps

    private func stepPage(_ step: RecipeStep, number: Int) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let url = step.imageUrl, !url.isEmpty {
                    Button {
                        zoomedPhoto = ZoomedPhoto(url: url)
                    } label: {
                        FoodImageView(imageUrl: url, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            .frame(height: 280)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.cookingViewPhoto)
                }

                Text(step.text)
                    .font(.title2)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
        }
    }

    // MARK: - Done

    private var donePage: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.green)
                    .accessibilityHidden(true)
                Text(L10n.cookingAllDone)
                    .font(.largeTitle.weight(.bold))
                    .multilineTextAlignment(.center)
                Text(L10n.cookingEnjoy)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    showLogSheet = true
                } label: {
                    Label(L10n.logRecipe, systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .padding(.top, 8)
            }
            .padding(20)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Accessibility

    /// What VoiceOver reads after Back/Next: focus stays on the button, so the
    /// new page's content would otherwise go unannounced.
    private var spokenSummary: String {
        if isOnDonePage { return "\(L10n.cookingAllDone). \(L10n.cookingEnjoy)" }
        if isOnIngredients { return L10n.ingredients }
        let index = page - stepOffset
        guard steps.indices.contains(index) else { return headerTitle }
        return "\(headerTitle). \(steps[index].text)"
    }

    // MARK: - Idle timer

    /// Guarded so an `onAppear` that isn't preceded by an `onDisappear` (a
    /// presentation over this view) can't record our own `true` as the value to
    /// restore, which would leave the screen awake for good.
    private func holdScreenAwake() {
        guard !holdsIdleTimer else { return }
        previousIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
        holdsIdleTimer = true
    }

    private func releaseScreen() {
        guard holdsIdleTimer else { return }
        UIApplication.shared.isIdleTimerDisabled = previousIdleTimerDisabled
        holdsIdleTimer = false
    }
}
