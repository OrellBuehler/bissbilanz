import Charts
import Combine
import SwiftUI
import TipKit

struct DashboardView: View {
    @Environment(EntryRepository.self) var entryRepository
    @Environment(FoodRepository.self) var foodRepository
    @Environment(RecipeRepository.self) var recipeRepository
    @Environment(GoalsRepository.self) var goalsRepository
    @Environment(PreferencesRepository.self) var preferencesRepository
    @Environment(SupplementRepository.self) var supplementRepository
    @Environment(WeightRepository.self) var weightRepository
    @Environment(SleepRepository.self) var sleepRepository
    @Environment(FastingTimerManager.self) var fastingManager
    @Environment(DeepLinkRouter.self) private var deepLinkRouter

    @State var entries: [Entry] = []
    @State var goals: Goals = .defaults
    @State var preferences: Preferences = .defaults
    @State var selectedDate = Date()
    @State var isLoading = false
    /// True when the last entries refresh failed and the day is empty — lets us
    /// show a retry affordance instead of a misleading "No entries yet" state
    /// (a swallowed refresh error looks identical to a genuinely empty day).
    @State var refreshFailed = false
    /// Bumped by each `loadData`; only the newest generation writes results back.
    @State var loadGeneration = 0
    @State var showFoodSearch = false
    @State var showScanner = false
    @State var showQuickEntry = false
    @State var showAIMeal = false
    @State var showCopyConfirmation = false
    @State var toastMessage: String?
    @State var isFastingDay = false
    /// Read from the local store in `loadFromStore` and kept fresh by
    /// `ActivityCard`; drives the "Activity: +N kcal" summary line and, when
    /// `preferences.activityGoalAdjustment` is on, the goal ring adjustment
    /// below (see `activityAdjustment`) — whether or not the card is shown.
    @State var dayActivityCalories: Int?
    /// Edge the incoming day content is pushed in from when the date changes.
    @State private var slideEdge: Edge = .trailing
    /// The calendar day that was "today" at last activation, so we can roll the
    /// selected date forward after a midnight rollover while backgrounded.
    @State private var trackedToday = Calendar.current.startOfDay(for: Date())

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    /// Widget data
    @State var supplementChecklist: [SupplementChecklist] = []
    /// Weight/sleep entries nearest the selected day, not simply the latest —
    /// browsing a past day must show that day's context, with each card
    /// captioned by the entry's own date.
    @State var closestWeight: WeightEntry?
    @State var closestSleep: SleepEntry?
    /// Everything below is derived from the local store, so the server-backed
    /// widgets keep working in Local mode and offline instead of erroring.
    @State var calorieTrend: [DashboardTrendPoint] = []
    @State var topFoods: [DashboardTopFood] = []
    @State var favoriteFoods: [Food] = []
    @State var selectedFavorite: Food?
    /// Every recipe, used to compute the recipe-suggestions card. Loaded (and
    /// refreshed) only while the widget is on, like `favoriteFoods` above.
    @State var allRecipes: [Recipe] = []

    /// Widgets, then the watch app — only one shows at a time, and the watch
    /// nudge only appears once the widgets tip has been dismissed/invalidated.
    @State private var dashboardTips = TipGroup(.ordered) {
        WidgetsTip()
        WatchAppTip()
    }
    let scanningTip = ScanningTip()
    private let dashboardLayoutTip = DashboardLayoutTip()
    @State var tipHelpSlug: HelpSlug = .mobileExtras
    @State var showTipHelp = false

    /// Days the trend chart and the top-foods card look back over, ending on
    /// the selected day.
    static let trendWindowDays = 7
    static let topFoodsLimit = 5

    var dateString: String {
        selectedDate.isoDateString
    }

    var totalCalories: Double {
        entries.reduce(0) { $0 + $1.totalCalories }
    }

    var totalProtein: Double {
        entries.reduce(0) { $0 + $1.totalProtein }
    }

    var totalCarbs: Double {
        entries.reduce(0) { $0 + $1.totalCarbs }
    }

    var totalFat: Double {
        entries.reduce(0) { $0 + $1.totalFat }
    }

    var totalFiber: Double {
        entries.reduce(0) { $0 + $1.totalFiber }
    }

    /// The selected day's goals, raised by a credited share of its workout
    /// calories when `preferences.activityGoalAdjustment` is on — unchanged
    /// with a zero bonus otherwise. Drives both the macro rings below and the
    /// "+N kcal from workouts" caption.
    var activityAdjustment: ActivityAdjustedGoals {
        adjustGoalsForActivity(
            goals: goals,
            activityCalories: dayActivityCalories,
            enabled: preferences.activityGoalAdjustment,
            creditPercent: preferences.activityCreditPercent
        )
    }

    private var mealGroups: [(String, [Entry])] {
        MealGrouping.group(entries)
    }

    /// Today's (activity-adjusted) goal minus what's already logged — the
    /// budget the recipe suggestions card scales recipes against.
    var remainingBudget: (calories: Double, protein: Double, carbs: Double, fat: Double) {
        let goals = activityAdjustment.goals
        return (
            calories: goals.calorieGoal - totalCalories,
            protein: goals.proteinGoal - totalProtein,
            carbs: goals.carbGoal - totalCarbs,
            fat: goals.fatGoal - totalFat
        )
    }

    /// Top 3 for the compact card; the full ranking lives on
    /// `RecipeSuggestionsView`. Empty once the goal is reached or no recipe's
    /// scaled portion fits the remaining budget — the card's own copy explains
    /// which.
    var recipeSuggestionsPreview: [DashboardRecipeSuggestion] {
        let byId = Dictionary(uniqueKeysWithValues: allRecipes.map { ($0.id, $0) })
        let suggestions = LocalRecipeSuggestions.suggest(remaining: remainingBudget, recipes: allRecipes, limit: 3)
        return suggestions.compactMap { suggestion in
            byId[suggestion.id].map { DashboardRecipeSuggestion(recipe: $0, suggestion: suggestion) }
        }
    }

    /// Calories per meal for the selected day, largest first. Derived from the
    /// entries already on screen — no request, so it works in every mode.
    var mealCalories: [DashboardMealSlice] {
        mealGroups
            .map { DashboardMealSlice(meal: $0.0, calories: $0.1.reduce(0) { $0 + $1.totalCalories }) }
            .filter { $0.calories > 0 }
            .sorted { $0.calories > $1.calories }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    dateNavigator

                    // Widgets/watch-app discovery — TipGroup shows at most one
                    // at a time (`.ordered`: the watch tip only once the
                    // widgets tip has been dismissed).
                    if let currentTip = dashboardTips.currentTip {
                        TipView(currentTip) { action in
                            guard action.id == "learn_more" else { return }
                            showHelp(for: .mobileExtras)
                        }
                    }

                    // ZStack so the outgoing and incoming day overlap during
                    // the push transition instead of stacking vertically.
                    ZStack {
                        dayContent
                            // Lets Siri resolve "this day" against the day on
                            // screen (iOS 18.4+; a no-op before). Applied
                            // innermost so `.id`/`.transition` stay the
                            // outermost modifiers and the push animation is
                            // unaffected.
                            .siriEntity(DaySummaryEntity.self, id: dateString)
                            .id(dateString)
                            .transition(reduceMotion ? .identity : .push(from: slideEdge))
                    }
                }
                .padding()
                // Extra bottom room so the floating action buttons never cover
                // the last meal card's totals — the content can always scroll
                // clear of the FAB instead of sitting permanently behind it.
                .padding(.bottom, 104)
            }
            .keyboardDismissable()
            .navigationTitle(L10n.appName)
            // Inline so the title and the layout-editor button share one row
            // instead of the large title pushing them onto two (TestFlight
            // feedback, 1.46.0) — the dashboard's own date navigator already
            // sits directly below, so a large title only cost vertical room.
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        DashboardLayoutView()
                    } label: {
                        Label(L10n.editDashboard, systemImage: "slider.horizontal.3")
                    }
                    .popoverTip(dashboardLayoutTip) { action in
                        guard action.id == "learn_more" else { return }
                        showHelp(for: .gettingStarted)
                    }
                }
            }
            // Unstructured so SwiftUI can't cancel it: `loadData` flips
            // `isLoading` straight away, the body re-renders, and the
            // refreshable task got cancelled mid-flight — every request died
            // as "cancelled", the stale cache repainted and entries logged via
            // MCP never showed until a relaunch.
            .refreshable { await Task { await loadData(paintFromStore: false) }.value }
            .toast(message: $toastMessage)
            .overlay(alignment: .bottomTrailing) { fab }
            .sheet(isPresented: $showTipHelp) {
                SafariView(url: HelpLink.url(for: tipHelpSlug))
            }
            .onAppear {
                WatchAppTip.isEligible = PhoneWatchConnectivity.shared.isWatchAppInstallEligible
            }
            .sheet(isPresented: $showFoodSearch) {
                NavigationStack {
                    FoodSearchView(date: dateString)
                }
                // Logging happens inside the sheet; reload on dismiss so the
                // new entries show without a manual pull-to-refresh.
                .onDisappear { Task { await loadData() } }
            }
            .sheet(isPresented: $showScanner) {
                // The scanner brings its own NavigationStack — its post-scan
                // steps are pushed inside it.
                BarcodeScannerView()
                    .onDisappear { Task { await loadData() } }
            }
            .sheet(isPresented: $showQuickEntry) {
                QuickEntrySheet(date: dateString) {
                    Task { await loadData() }
                }
            }
            .sheet(item: $selectedFavorite) { food in
                LogFoodSheet(food: food, date: dateString)
                    .onDisappear { Task { await loadData() } }
            }
            .sheet(isPresented: $showAIMeal) {
                AIMealSheet(date: dateString, onLogged: { count in
                    toastMessage = L10n.aiMealItemsLogged(count)
                    Task { await loadData() }
                }, onQueued: {
                    toastMessage = L10n.aiTaskQueued
                })
            }
            .confirmationDialog(L10n.copyYesterday, isPresented: $showCopyConfirmation) {
                Button(L10n.copyYesterday) {
                    Task { await copyYesterday() }
                }
            } message: {
                Text(L10n.copyConfirmation(to: DateFormatting.displayString(from: selectedDate)))
            }
            // Keyed on the day so switching dates cancels the previous load
            // instead of racing it (see `loadData`).
            .task(id: dateString) { await loadData() }
            // Coming back from the layout editor (or Settings) with changed
            // preferences: repaint from the store, which is the only path
            // that also (re)loads the data a newly enabled card needs.
            .onAppear {
                guard let stored = preferencesRepository.preferences(), stored != preferences else { return }
                loadFromStore()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                let newToday = Calendar.current.startOfDay(for: Date())
                if newToday != trackedToday {
                    // Day rolled over while backgrounded; if we were showing the old
                    // "today", follow the rollover instead of staying stuck on it.
                    let followRollover = Calendar.current.isDate(selectedDate, inSameDayAs: trackedToday)
                    trackedToday = newToday
                    if followRollover {
                        // The date change re-runs `.task(id: dateString)`.
                        selectedDate = Date()
                        return
                    }
                }
                // Entries logged elsewhere (MCP, web, another device) while
                // backgrounded only arrive through a refresh — same as DayLogView.
                Task { await loadData() }
            }
            // The on-activation Apple Health import (BissbilanzApp) finishes
            // after this view is already showing — re-read the store so the
            // weight/sleep cards pick up freshly imported entries.
            .onReceive(NotificationCenter.default.publisher(for: HealthKitImporter.didImportNotification)) { _ in
                loadFromStore()
            }
            // A widget/Siri deep link (scan, log, weight, food, recipe) is
            // presented by ContentView above the tabs; the sheets this view
            // presents itself reload on dismiss, so this one must too.
            .onChange(of: deepLinkRouter.dismissedCount) { _, _ in
                Task { await loadData() }
            }
        }
    }

    // MARK: - Day Content

    /// Everything below the date navigator; swapped out with a directional
    /// push transition when the selected date changes.
    private var dayContent: some View {
        VStack(spacing: 16) {
            macroRings

            if preferences.showActivityWidget, let dayActivityCalories, dayActivityCalories > 0 {
                activitySummaryLine(dayActivityCalories)
            }

            ForEach(renderedSections, id: \.self) { section in
                sectionView(for: section)
            }
        }
    }

    /// Resolves `preferences.widgetOrder` into the sections the dashboard can
    /// draw, respecting each one's visibility toggle. `summary` (the macro
    /// header above, always pinned ahead of this list) and `streaks` (no
    /// dashboard card exists) never appear here — see `DashboardSection`.
    private var visibleSections: [DashboardSection] {
        DashboardSection.resolve(order: preferences.widgetOrder, preferences: preferences)
    }

    /// `visibleSections` plus each section's own data-presence guard — today
    /// only `weight` has one (no entry near the selected day to show it).
    /// Drives both the `ForEach` below and the weight/sleep pairing rule, so
    /// the two always agree on what actually lands on screen.
    private var renderedSections: [DashboardSection] {
        visibleSections.filter { $0 != .weight || closestWeight != nil }
    }

    /// Weight and sleep share one row at half width each when they land next
    /// to each other in `renderedSections`, in either order; otherwise each
    /// renders full width on its own. Returns the partner that follows
    /// `section` when `section` leads the pair, so the leading section draws
    /// the row and the trailing one draws nothing.
    private func pairedPartner(after section: DashboardSection) -> DashboardSection? {
        guard section == .weight || section == .sleep,
              let index = renderedSections.firstIndex(of: section),
              index + 1 < renderedSections.count
        else { return nil }
        let next = renderedSections[index + 1]
        return (next == .weight || next == .sleep) && next != section ? next : nil
    }

    private func isTrailingInPair(_ section: DashboardSection) -> Bool {
        guard let index = renderedSections.firstIndex(of: section), index > 0 else { return false }
        return pairedPartner(after: renderedSections[index - 1]) == section
    }

    @ViewBuilder
    private func pairedRow(_ first: DashboardSection, _ second: DashboardSection) -> some View {
        // `fixedSize` + `maxHeight` keeps the two cards equal-height when
        // their content differs.
        HStack(spacing: 16) {
            pairedCard(first)
            pairedCard(second)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func pairedCard(_ section: DashboardSection) -> some View {
        switch section {
        case .weight:
            if let weight = closestWeight {
                NavigationLink {
                    WeightView()
                } label: {
                    weightWidget(weight, fillHeight: true)
                }
                .buttonStyle(.plain)
            }
        default:
            NavigationLink {
                SleepView()
            } label: {
                sleepWidget(fillHeight: true)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private func sectionView(for section: DashboardSection) -> some View {
        switch section {
        case .fasting:
            fastingSection
        case .water:
            WaterCard(date: dateString)
        case .activity:
            ActivityCard(date: dateString) { dayActivityCalories = $0 }
        case .notes:
            NotesCard(date: dateString)
        case .daylog:
            daylogSection
        case .chart:
            calorieTrendWidget
        case .favorites:
            favoritesWidget
        case .recipeSuggestions:
            recipeSuggestionsWidget
        case .supplements:
            if !supplementChecklist.isEmpty {
                supplementsWidget
            }
        case .weight:
            weightSection
        case .sleep:
            sleepSection
        case .mealBreakdown:
            mealBreakdownWidget
        case .topFoods:
            topFoodsWidget
        case .streaks, .summary, .dayProperties:
            EmptyView()
        }
    }

    @ViewBuilder
    private var fastingSection: some View {
        if selectedDate.isToday {
            fastingCard
        }
        if totalCalories == 0, !refreshFailed {
            fastingDayToggleCard
        }
    }

    private var fastingDayToggleCard: some View {
        HStack {
            Image(systemName: "fork.knife")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.fastingDay)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(L10n.fastingDayDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Toggle("", isOn: Binding(
                get: { isFastingDay },
                set: { _ in Task { await toggleFastingDay() } }
            ))
            .labelsHidden()
            .accessibilityLabel(L10n.fastingDay)
            .accessibilityHint(L10n.fastingDayDescription)
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var daylogSection: some View {
        if mealGroups.isEmpty, !isLoading {
            if refreshFailed {
                refreshErrorState
            } else {
                emptyState
            }
        } else {
            ForEach(mealGroups, id: \.0) { meal, mealEntries in
                // Label-based link like the fasting/weight/sleep cards —
                // the value-based variant stopped resolving its
                // destination on iOS 26.6 (card highlighted, no push).
                NavigationLink {
                    DayLogView(date: dateString)
                } label: {
                    MealCard(mealType: meal, entries: mealEntries)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var weightSection: some View {
        if let weight = closestWeight {
            if let partner = pairedPartner(after: .weight) {
                pairedRow(.weight, partner)
            } else if !isTrailingInPair(.weight) {
                NavigationLink {
                    WeightView()
                } label: {
                    weightWidget(weight, fillHeight: false)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var sleepSection: some View {
        if let partner = pairedPartner(after: .sleep) {
            pairedRow(.sleep, partner)
        } else if !isTrailingInPair(.sleep) {
            NavigationLink {
                SleepView()
            } label: {
                sleepWidget(fillHeight: false)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Date Navigation

    /// Moves the selected date by `delta` days with a directional push
    /// animation within the supported entry date range, never past today.
    private func changeDay(by delta: Int) {
        let target = Calendar.current.startOfDay(for: selectedDate.adding(days: delta))
        guard delta != 0,
              DateFormatting.entryDateRange.contains(target),
              target <= Calendar.current.startOfDay(for: Date())
        else { return }
        slideEdge = delta > 0 ? .trailing : .leading
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) {
            selectedDate = selectedDate.adding(days: delta)
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func goToToday() {
        slideEdge = .trailing
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) {
            selectedDate = Date()
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    // MARK: - Date Navigator

    private var dateNavigator: some View {
        HStack {
            Button {
                changeDay(by: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(L10n.previousDay)

            Spacer()

            VStack(spacing: 2) {
                Text(L10n.dayLabel(selectedDate))
                    .font(.title3)
                    .fontWeight(.semibold)
                    .accessibilityAddTraits(.isHeader)
                if !selectedDate.isToday {
                    Button(L10n.goToToday) {
                        goToToday()
                    }
                    .font(.caption)
                }
            }

            Spacer()

            Button {
                changeDay(by: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .disabled(selectedDate.isToday)
            .accessibilityLabel(L10n.nextDay)
        }
        .padding(.horizontal)
    }
}
