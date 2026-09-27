import SwiftData
import SwiftUI

struct FoodSearchView: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(AppModeManager.self) private var appMode
    @Environment(\.dismiss) private var dismiss

    var date: String?
    /// Prefills the search field — the Visual Intelligence "more results"
    /// hand-off (`FoodVisualIntelligenceSearchIntent`) opens this screen with
    /// its best-guess label already typed in.
    var initialQuery: String?

    @State private var query = ""
    @State private var searchResults: [Food] = []
    @State private var offResults: [BissbilanzAPI.OpenFoodFactsSearchHit] = []
    @State private var isSearchingOff = false
    @State private var isResolvingOff = false
    @State private var allFoods: [Food] = []
    @State private var allFoodsOffset = 0
    @State private var canLoadMoreAll = true
    @State private var isLoadingMoreAll = false
    @State private var allFoodsTask: Task<Void, Never>?
    @State private var recentFoods: [Food] = []
    @State private var favoriteFoods: [Food] = []
    @State private var selectedTab = 0
    @State private var isSearching = false
    @State private var selectedFood: Food?
    @State private var editingFood: Food?
    @State private var showLogSheet = false
    @State private var showCreateFood = false
    @State private var showCreateRecipe = false
    @State private var searchTask: Task<Void, Never>?
    @State private var errorMessage: String?
    @State private var toastMessage: String?
    /// Multi-select for merging: checkmarks on the left of every list, and a
    /// merge button pinned to the bottom once two or more are picked.
    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var mergeCandidates: FoodMergeCandidates?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $selectedTab.animation(reduceMotion ? nil : .default)) {
                Text(L10n.all).tag(0)
                Text(L10n.recent).tag(1)
                Text(L10n.favorites).tag(2)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            TabView(selection: $selectedTab) {
                allTab
                    .tag(0)
                recentTab
                    .tag(1)
                favoritesTab
                    .tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .environment(\.editMode, .constant(isSelecting ? .active : .inactive))
        }
        .safeAreaInset(edge: .bottom) {
            if isSelecting {
                mergeSelectionButton
            }
        }
        .navigationTitle(L10n.foods)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                if isSelecting {
                    Button(L10n.cancel) { endSelection() }
                } else if date != nil {
                    Button(L10n.close) { dismiss() }
                }
            }
            ToolbarItem(placement: .primaryAction) {
                if !isSelecting {
                    toolbarActions
                }
            }
        }
        .sheet(item: $mergeCandidates) { candidates in
            FoodMergeSheet(candidates: candidates) { merged in
                endSelection()
                toastMessage = L10n.foodsMergeSuccess
                foodUpdated(merged)
                Task {
                    await loadAll()
                    await loadRecent()
                    await loadFavorites()
                    await search(query)
                }
            }
        }
        .searchable(text: $query, prompt: L10n.searchFoods)
        .onChange(of: query) { _, newValue in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
                await search(newValue)
            }
        }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
        .toast(message: $toastMessage)
        .sheet(item: $selectedFood, onDismiss: {
            // The search field's keyboard survives the sheet's presentation and
            // pops back up over the results when it closes — drop first
            // responder so the list (and the field itself) stays readable.
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder),
                to: nil,
                from: nil,
                for: nil
            )
        }) { food in
            LogFoodSheet(food: food, date: date ?? DateFormatting.today)
        }
        .sheet(item: $editingFood) { food in
            FoodEditSheet(food: food) { updated in
                foodUpdated(updated)
            }
        }
        .sheet(isPresented: $showCreateFood) {
            FoodEditSheet { _ in
                Task {
                    await loadAll()
                    await loadRecent()
                }
            }
        }
        .sheet(isPresented: $showCreateRecipe) {
            RecipeEditSheet()
        }
        .task {
            if let initialQuery, !initialQuery.isEmpty {
                query = initialQuery
            }
            await loadRecent()
            await loadFavorites()
            await loadAll()
        }
    }

    /// Rows are logging buttons outside select mode, so the lists only take
    /// selection writes while it is on.
    private var selection: Binding<Set<String>> {
        Binding(get: { selectedIds }, set: { if isSelecting { selectedIds = $0 } })
    }

    private var canMerge: Bool {
        date == nil && !appMode.isLocal
    }

    private var toolbarActions: some View {
        HStack(spacing: 12) {
            // Duplicate detection and merging are server-side — no account,
            // no server to scan or merge on (mirrors AIMealSheet's
            // `!appMode.isLocal` gating on other account-only actions).
            if canMerge {
                Button {
                    isSelecting = true
                } label: {
                    Image(systemName: "checkmark.circle")
                }
                .accessibilityLabel(L10n.foodsSelect)

                NavigationLink {
                    FoodDuplicatesView()
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .accessibilityLabel(L10n.foodsDuplicatesViewAll)
            }

            // A single + presents a menu: foods and recipes are both
            // created from here, so the Settings "quick actions" duplicates
            // are gone and the Foods tab is the one place to add either.
            Menu {
                Button {
                    showCreateFood = true
                } label: {
                    Label(L10n.createFood, systemImage: "fork.knife")
                }
                Button {
                    showCreateRecipe = true
                } label: {
                    Label(L10n.createRecipe, systemImage: "book")
                }
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityLabel(L10n.create)
        }
    }

    /// The server merges up to 20 sources into one keeper.
    private static let maxMergeSelection = 21

    private var mergeSelectionButton: some View {
        let count = selectedIds.count
        return Button {
            openMergeForSelection()
        } label: {
            Label(
                count >= 2 ? L10n.foodsMergeSelected(count) : L10n.foodsSelectToMerge,
                systemImage: "arrow.triangle.merge"
            )
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(count < 2 || count > Self.maxMergeSelection)
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    private func endSelection() {
        isSelecting = false
        selectedIds = []
    }

    /// Resolves the selected ids from whichever lists loaded them (the local
    /// store as a fallback for rows paged out since) and opens the review.
    private func openMergeForSelection() {
        let loaded = allFoods + searchResults + recentFoods + favoriteFoods
        let byId = Dictionary(loaded.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let foods = selectedIds
            .compactMap { byId[$0] ?? foodRepository.food(id: $0) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        guard foods.count >= 2 else { return }
        mergeCandidates = FoodMergeCandidates(foods: foods)
    }

    /// The catalog, alphabetical and paged in as the user scrolls, until two
    /// characters are typed — then the server search (with its Open Food
    /// Facts fallback) takes over, so this one tab covers both browsing and
    /// searching. `List` only materialises visible rows, and pages keep the
    /// backing array bounded for users with thousands of foods.
    private var allTab: some View {
        Group {
            if query.count < 2 {
                let items = allFoods.filter { matches($0) }
                if items.isEmpty {
                    if isLoadingMoreAll {
                        LoadingView(message: L10n.loading)
                    } else if query.isEmpty {
                        ContentUnavailableView(L10n.all, systemImage: "fork.knife", description: Text(L10n.noFoodsYet))
                    } else {
                        ContentUnavailableView(
                            L10n.noResults,
                            systemImage: "magnifyingglass",
                            description: Text("\(L10n.noResults): \"\(query)\"")
                        )
                    }
                } else {
                    List(selection: selection) {
                        ForEach(items) { food in
                            foodRow(food)
                                .onAppear {
                                    if food.id == allFoods.last?.id { loadMoreAll() }
                                }
                        }
                        if isLoadingMoreAll {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            } else if isSearching {
                LoadingView(message: L10n.loading)
            } else if searchResults.isEmpty, offResults.isEmpty, !isSearchingOff {
                ContentUnavailableView(
                    L10n.noResults,
                    systemImage: "magnifyingglass",
                    description: Text("\(L10n.noResults): \"\(query)\"")
                )
            } else {
                List(selection: selection) {
                    ForEach(searchResults) { food in
                        foodRow(food)
                    }
                    // Open Food Facts hits aren't in the user's database yet,
                    // so there is nothing to merge them with.
                    if !isSelecting, isSearchingOff || !offResults.isEmpty {
                        Section(L10n.openFoodFacts) {
                            if isSearchingOff {
                                HStack {
                                    Spacer()
                                    ProgressView()
                                    Spacer()
                                }
                            } else {
                                ForEach(offResults) { hit in
                                    openFoodFactsRow(hit)
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    /// An Open Food Facts hit is copied into the user's database on tap and
    /// then logged like any own food, mirroring the barcode scanner.
    private func openFoodFactsRow(_ hit: BissbilanzAPI.OpenFoodFactsSearchHit) -> some View {
        Button {
            Task { await addFromOpenFoodFacts(hit) }
        } label: {
            HStack {
                if hit.imageUrl != nil {
                    FoodImageView(imageUrl: hit.imageUrl)
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(hit.name)
                        .font(.body)
                        .foregroundStyle(.primary)
                    HStack(spacing: 4) {
                        Text("\(Int(hit.calories)) cal")
                            .foregroundStyle(accessibleColor(.calories))
                        Text("\u{00B7}")
                            .foregroundStyle(.secondary)
                        Text("P\(Int(hit.protein))")
                            .foregroundStyle(accessibleColor(.protein))
                        Text("C\(Int(hit.carbs))")
                            .foregroundStyle(accessibleColor(.carbs))
                        Text("F\(Int(hit.fat))")
                            .foregroundStyle(accessibleColor(.fat))
                    }
                    .font(.caption)
                }
                Spacer()
                if let brand = hit.brand, !brand.isEmpty {
                    Text(brand)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .disabled(isResolvingOff)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(openFoodFactsAccessibilityLabel(hit))
    }

    private func openFoodFactsAccessibilityLabel(_ hit: BissbilanzAPI.OpenFoodFactsSearchHit) -> String {
        var parts = [hit.name]
        if let brand = hit.brand, !brand.isEmpty { parts.append(brand) }
        parts.append(MacroSpokenSummary.macros(calories: hit.calories, protein: hit.protein, carbs: hit.carbs, fat: hit.fat))
        return parts.joined(separator: ", ")
    }

    private func addFromOpenFoodFacts(_ hit: BissbilanzAPI.OpenFoodFactsSearchHit) async {
        guard !isResolvingOff else { return }
        isResolvingOff = true
        defer { isResolvingOff = false }
        do {
            guard let food = try await foodRepository.findOrCreateFromOpenFoodFacts(barcode: hit.barcode) else {
                errorMessage = L10n.openFoodFactsAddFailed
                return
            }
            selectedFood = food
        } catch {
            ErrorReporter.captureWarning("Open Food Facts food resolution failed", context: ["reason": ErrorReporter.reason(for: error)])
            errorMessage = L10n.openFoodFactsAddFailed
        }
    }

    /// The shared search field filters the Recent/Favorites lists too — typing
    /// here narrows whichever tab is showing, not just the Search tab.
    private func matches(_ food: Food) -> Bool {
        if query.isEmpty || food.name.localizedCaseInsensitiveContains(query) { return true }
        if let label = LabelNormalizer.normalize(query), food.labels?.contains(label) == true { return true }
        return food.brand?.localizedCaseInsensitiveContains(query) ?? false
    }

    private var recentTab: some View {
        let items = recentFoods.filter { matches($0) }
        return Group {
            if items.isEmpty {
                if query.isEmpty {
                    ContentUnavailableView(L10n.recent, systemImage: "clock", description: Text(L10n.noRecentFoods))
                } else {
                    ContentUnavailableView(
                        L10n.noResults,
                        systemImage: "magnifyingglass",
                        description: Text("\(L10n.noResults): \"\(query)\"")
                    )
                }
            } else {
                List(selection: selection) {
                    ForEach(items) { food in
                        foodRow(food)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var favoritesTab: some View {
        let items = favoriteFoods.filter { matches($0) }
        return Group {
            if items.isEmpty {
                if query.isEmpty {
                    ContentUnavailableView(
                        L10n.favorites,
                        systemImage: "star",
                        description: Text(L10n.markFavoritesHint)
                    )
                } else {
                    ContentUnavailableView(
                        L10n.noResults,
                        systemImage: "magnifyingglass",
                        description: Text("\(L10n.noResults): \"\(query)\"")
                    )
                }
            } else {
                List(selection: selection) {
                    ForEach(items) { food in
                        foodRow(food)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    /// While selecting, a row is just its content: the list's own selection
    /// handles taps, and the log button and context menu would compete with it.
    @ViewBuilder
    private func foodRow(_ food: Food) -> some View {
        if isSelecting {
            foodRowContent(food)
                .contentShape(Rectangle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(foodAccessibilityLabel(food))
        } else {
            actionableFoodRow(food)
        }
    }

    private func foodRowContent(_ food: Food) -> some View {
        HStack {
            if food.imageUrl != nil {
                FoodImageView(imageUrl: food.imageUrl)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(food.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                HStack(spacing: 4) {
                    Text("\(Int(food.calories)) cal")
                        .foregroundStyle(accessibleColor(.calories))
                    Text("\u{00B7}")
                        .foregroundStyle(.secondary)
                    Text("P\(Int(food.protein))")
                        .foregroundStyle(accessibleColor(.protein))
                    Text("C\(Int(food.carbs))")
                        .foregroundStyle(accessibleColor(.carbs))
                    Text("F\(Int(food.fat))")
                        .foregroundStyle(accessibleColor(.fat))
                }
                .font(.caption)
            }
            Spacer()
            if let brand = food.brand {
                Text(brand)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            if food.isFavorite {
                Image(systemName: "star.fill")
                    .font(.caption)
                    .foregroundStyle(.yellow)
                    .accessibilityHidden(true)
            }
        }
    }

    private func actionableFoodRow(_ food: Food) -> some View {
        HStack {
            Button {
                selectedFood = food
            } label: {
                foodRowContent(food)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(foodAccessibilityLabel(food))

            if date != nil {
                Button {
                    Task { await quickLogFood(food) }
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.quickLogFoodAccessibility(food.name))
            }
        }
        // A bare long-press used to jump straight into editing, which gave no
        // hint that tap and long-press did different things. A context menu
        // names both actions instead, leaving tap as the fast path to logging.
        .contextMenu {
            Button {
                selectedFood = food
            } label: {
                Label(L10n.logFood, systemImage: "plus.circle")
            }
            Button {
                editingFood = food
            } label: {
                Label(L10n.editFood, systemImage: "pencil")
            }
            Button {
                Task { await toggleFavorite(food) }
            } label: {
                Label(
                    food.isFavorite ? L10n.removeFromFavorites : L10n.addToFavorites,
                    systemImage: food.isFavorite ? "star.slash" : "star"
                )
            }
            if canMerge {
                Button {
                    selectedIds = [food.id]
                    isSelecting = true
                } label: {
                    Label(L10n.foodsSelect, systemImage: "checkmark.circle")
                }
            }
        }
    }

    private func foodAccessibilityLabel(_ food: Food) -> String {
        var parts = [food.name]
        if let brand = food.brand { parts.append(brand) }
        parts.append(MacroSpokenSummary.macros(calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat))
        if food.isFavorite { parts.append(L10n.favorite) }
        return parts.joined(separator: ", ")
    }

    private func toggleFavorite(_ food: Food) async {
        do {
            let updated = try await foodRepository.toggleFavorite(foodId: food.id, isFavorite: !food.isFavorite)
            foodUpdated(updated)
            await loadFavorites()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Reflects an edit back into whichever list(s) currently show this food.
    private func foodUpdated(_ updated: Food) {
        for index in searchResults.indices where searchResults[index].id == updated.id {
            searchResults[index] = updated
        }
        for index in allFoods.indices where allFoods[index].id == updated.id {
            allFoods[index] = updated
        }
        for index in recentFoods.indices where recentFoods[index].id == updated.id {
            recentFoods[index] = updated
        }
        for index in favoriteFoods.indices where favoriteFoods[index].id == updated.id {
            favoriteFoods[index] = updated
        }
    }

    /// The debounce checks `Task.isCancelled` before calling this, but never
    /// again once the await is under way. Cancellation surfaces through
    /// URLSession as a thrown error, which `searchFoods` turns into a local
    /// fallback or an empty array — so a superseded search used to clear the
    /// list and stop the spinner while the current one was still running (the
    /// "No results" flash mid-typing). Only the search for the query still in
    /// the field writes back.
    private func search(_ query: String) async {
        guard query.count >= 2 else {
            searchResults = []
            offResults = []
            // A superseded search no longer clears this, so the query dropping
            // below the minimum length has to.
            isSearching = false
            isSearchingOff = false
            return
        }
        isSearching = true
        let results = await foodRepository.searchFoods(query: query)
        guard !Task.isCancelled, query == self.query else { return }
        searchResults = results
        isSearching = false
        // Mirrors the web FoodPicker: only fall back to Open Food Facts when
        // the user's own database has few matches.
        guard results.count < Self.offFallbackThreshold else {
            offResults = []
            isSearchingOff = false
            return
        }
        isSearchingOff = true
        offResults = []
        let hits = await foodRepository.searchOpenFoodFacts(query: query)
        guard !Task.isCancelled, query == self.query else { return }
        offResults = hits
        isSearchingOff = false
    }

    private static let offFallbackThreshold = 5

    private static let allPageSize = 50

    private func loadAll() async {
        allFoodsTask?.cancel()
        allFoodsOffset = 0
        canLoadMoreAll = true
        allFoods = []
        await fetchNextAllPage()
    }

    private func loadMoreAll() {
        guard !isLoadingMoreAll, canLoadMoreAll else { return }
        allFoodsTask = Task { await fetchNextAllPage() }
    }

    private func fetchNextAllPage() async {
        isLoadingMoreAll = true
        defer { isLoadingMoreAll = false }
        let page = await foodRepository.foodsPage(limit: Self.allPageSize, offset: allFoodsOffset)
        guard !Task.isCancelled else { return }
        let known = Set(allFoods.map(\.id))
        allFoods += page.filter { !known.contains($0.id) }
        allFoodsOffset += page.count
        canLoadMoreAll = page.count == Self.allPageSize
    }

    private func loadRecent() async {
        recentFoods = foodRepository.localRecentFoods()
        recentFoods = await foodRepository.refreshRecentFoods()
    }

    private func loadFavorites() async {
        favoriteFoods = foodRepository.favorites()
        do {
            try await foodRepository.refreshFavorites()
            favoriteFoods = foodRepository.favorites()
        } catch {
            if favoriteFoods.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func mealForCurrentTime() -> String {
        MealTiming.mealForCurrentTime()
    }

    private func quickLogFood(_ food: Food) async {
        guard let date else { return }
        let entry = EntryCreate(
            foodId: food.id,
            mealType: mealForCurrentTime(),
            servings: 1,
            date: date
        )
        do {
            try await entryRepository.createEntry(entry, food: food)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = "\(food.name) \(L10n.logged)"
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToLog
        }
    }
}

/// Presentation wrapper for `LogFoodForm`: supplies the `NavigationStack` and
/// Cancel button a flat sheet needs. Flows that push the form into their own
/// stack (the barcode scanner) use `LogFoodForm` directly.
struct LogFoodSheet: View {
    @Environment(\.dismiss) private var dismiss

    let food: Food
    let date: String
    /// Fired after a successful log, once this sheet has dismissed itself —
    /// lets a presenting flow (e.g. the barcode scanner) collapse its own
    /// sheet stack instead of leaving the user on an intermediate screen.
    var onLogged: (() -> Void)?
    var showsDetailsLink = false

    init(food: Food, date: String, showsDetailsLink: Bool = false, onLogged: (() -> Void)? = nil) {
        self.food = food
        self.date = date
        self.showsDetailsLink = showsDetailsLink
        self.onLogged = onLogged
    }

    var body: some View {
        NavigationStack {
            LogFoodForm(food: food, date: date, showsDetailsLink: showsDetailsLink) {
                dismiss()
                onLogged?()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
        }
    }
}

/// Bare log form: no `NavigationStack`, no Cancel item, and it never dismisses
/// itself — `@Environment(\.dismiss)` pops when pushed and dismisses when
/// presented, so the enclosing container decides what happens after `onLogged`
/// and one body stays correct in both modes.
struct LogFoodForm: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.modelContext) private var modelContext

    let food: Food
    /// Fired after a successful log; the enclosing flow dismisses (or pops)
    /// from here.
    var onLogged: () -> Void
    /// Offers a link through to the food's detail page. Only for flows that
    /// reach this form without passing the detail page on the way in — the
    /// detail page presents this form itself, so linking back from there
    /// would let the two stack on each other indefinitely.
    var showsDetailsLink = false

    @State private var logDate: Date
    @State private var servings: Double = 1.0
    @State private var mealType: String
    /// The same list the watch offers, learned from the log rather than
    /// hardcoded. A custom meal type created on the web was visible on the
    /// phone (entries carry it, `MealGrouping` renders it) and pickable on the
    /// watch, but could not be chosen when logging here. Seeded with the
    /// standard set so the picker is never momentarily empty.
    @State private var mealTypes = WidgetSnapshotWriter.standardMealTypes
    @State private var eatenTime = Date()
    @State private var notes = ""
    @State private var isLogging = false
    @State private var errorMessage: String?

    init(food: Food, date: String, showsDetailsLink: Bool = false, onLogged: @escaping () -> Void = {}) {
        self.food = food
        self.onLogged = onLogged
        self.showsDetailsLink = showsDetailsLink
        _logDate = State(initialValue: DateFormatting.date(from: date) ?? Date())
        // The quick-log path picks the meal from the clock; this form defaulted
        // to "Lunch" regardless, so the two disagreed about the meal at 8 a.m.
        _mealType = State(initialValue: MealTiming.mealForCurrentTime())
    }

    /// "2 × 100 g = 200 g" — without the total there is no way to tell what a
    /// multiplier actually amounts to.
    private var servingSizeText: String {
        let count = MacroFormat.servings(servings)
        let unit = food.servingUnit.displayName
        let perServing = "\(MacroFormat.nutrient(food.servingSize)) \(unit)"
        let total = "\(MacroFormat.nutrient(food.servingSize * servings)) \(unit)"
        return "\(count) × \(perServing) = \(total)"
    }

    /// Loaded once in `.task` rather than computed in `body`: it reads the
    /// store, and `body` re-evaluates on every servings tick.
    private func loadMealTypes() {
        var types = WidgetSnapshotWriter.mealTypes(context: modelContext)
        // The current selection may predate the window the list is learned
        // from; a Picker whose selection isn't among its options renders blank.
        if !types.contains(mealType) {
            types.append(mealType)
        }
        mealTypes = types
    }

    var body: some View {
        Form {
            Section {
                FoodHeaderImage(imageUrl: food.imageUrl)
                    .accessibilityHidden(true)
                HStack {
                    Text(food.name)
                        .font(.headline)
                    Spacer()
                    if let brand = food.brand {
                        Text(brand)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            Section(L10n.servings) {
                ServingsField(servings: $servings)
                HStack {
                    Text(L10n.servingSize)
                    Spacer()
                    Text(servingSizeText)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .accessibilityElement(children: .combine)
            }

            Section {
                Picker(L10n.meal, selection: $mealType) {
                    ForEach(mealTypes, id: \.self) { meal in
                        Text(L10n.mealName(meal)).tag(meal)
                    }
                }
                .pickerStyle(.menu)
                DatePicker(L10n.date, selection: $logDate, displayedComponents: .date)
                TimePickerRow(L10n.time, selection: $eatenTime)
            }

            Section(L10n.notes) {
                TextField(L10n.notes, text: $notes, axis: .vertical)
                    .lineLimit(2 ... 4)
            }

            Section(L10n.nutrition) {
                NutrientRow(label: L10n.calories, value: food.calories * servings, unit: "kcal")
                NutrientRow(label: L10n.protein, value: food.protein * servings, unit: "g")
                NutrientRow(label: L10n.carbs, value: food.carbs * servings, unit: "g")
                NutrientRow(label: L10n.fat, value: food.fat * servings, unit: "g")
                NutrientRow(label: L10n.fiber, value: food.fiber * servings, unit: "g")
            }

            NutrientSection(title: L10n.fatBreakdown, nutrients: scaled(food.fatBreakdownNutrients))
            NutrientSection(title: L10n.sugarsCarbs, nutrients: scaled(food.sugarCarbNutrients))
            NutrientSection(title: L10n.minerals, nutrients: scaled(food.mineralNutrients))
            NutrientSection(title: L10n.vitamins, nutrients: scaled(food.vitaminNutrients))
            NutrientSection(title: L10n.other, nutrients: scaled(food.otherNutrients))

            FoodQualitySection(food: food)
        }
        .task { loadMealTypes() }
        .navigationTitle(L10n.logFood)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.log) {
                    Task { await logFood() }
                }
                .disabled(isLogging)
                .fontWeight(.semibold)
            }
            // Logging is the fast path, but the full detail — and the edit
            // action on it — stays one tap away. Logging from the detail page
            // completes this flow the same way logging here does.
            ToolbarItem(placement: .topBarTrailing) {
                if showsDetailsLink {
                    NavigationLink {
                        FoodDetailView(foodId: food.id, onLogged: onLogged)
                    } label: {
                        Image(systemName: "info.circle")
                    }
                    .accessibilityLabel(L10n.details)
                }
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

    private func logFood() async {
        isLogging = true
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = EntryCreate(
            foodId: food.id,
            mealType: mealType,
            servings: servings,
            date: logDate.isoDateString,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            eatenAt: eatenAtString()
        )
        do {
            try await entryRepository.createEntry(entry, food: food)
            onLogged()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLogging = false
    }

    /// Extended nutrients scaled to the picked serving count, matching the
    /// per-serving macro rows above.
    private func scaled(_ nutrients: [(String, Double, String)]) -> [(String, Double, String)] {
        nutrients.map { ($0.0, $0.1 * servings, $0.2) }
    }

    /// The picked time-of-day on the picked log date, as the UTC ISO-8601
    /// `eatenAt` wire value. `nil` (log time falls back to `createdAt`) only if
    /// the components can't be combined.
    private func eatenAtString() -> String? {
        DateFormatting.eatenAtString(time: eatenTime, on: logDate)
    }
}
