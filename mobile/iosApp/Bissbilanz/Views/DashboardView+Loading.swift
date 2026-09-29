import SwiftUI

extension DashboardView {
    // MARK: - Data Loading

    /// Instant render from the local store; `loadData` refreshes from the API on top.
    func loadFromStore() {
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults
        isFastingDay = entryRepository.isFastingDay(date: dateString)
        dayActivityCalories = entryRepository.dayProperties(date: dateString)?.activityCalories
        supplementChecklist = supplementRepository.localChecklist(date: dateString)
        closestWeight = weightRepository.closest(to: dateString)
        closestSleep = sleepRepository.closest(to: dateString)
        favoriteFoods = preferences.showFavoritesWidget ? foodRepository.favorites() : []
        allRecipes = preferences.showRecipeSuggestionsWidget ? recipeRepository.recipes() : []
        loadEntriesFromStore()
    }

    /// Just the entry-derived state: the day's list and the two cards computed
    /// from it. A local write that only touched entries (a favorite quick-log,
    /// a copied day) re-reads this instead of the whole dashboard.
    private func loadEntriesFromStore() {
        let dayEntries = entryRepository.entries(date: dateString)
        entries = dayEntries
        loadTrendWindow(selectedDayEntries: dayEntries)
    }

    /// Walks the trend window once, building both the calorie series and the
    /// most-logged tally. Skipped entirely when neither card is on.
    ///
    /// The window comes back in a single range fetch — it used to be one fetch
    /// per day, on the main actor, on the app's most-used screen — and the
    /// selected day reuses the list the caller just read rather than fetching
    /// it again.
    private func loadTrendWindow(selectedDayEntries: [Entry]) {
        guard preferences.showChartWidget || preferences.showTopFoodsWidget else {
            calorieTrend = []
            topFoods = []
            return
        }
        let selectedDay = dateString
        let windowStart = selectedDate.adding(days: -(Self.trendWindowDays - 1)).isoDateString
        let byDate = entryRepository.entriesByDate(from: windowStart, to: selectedDay)
        var trend: [DashboardTrendPoint] = []
        var tally: [String: (count: Int, calories: Double)] = [:]
        for offset in stride(from: Self.trendWindowDays - 1, through: 0, by: -1) {
            let day = selectedDate.adding(days: -offset)
            let key = day.isoDateString
            let dayEntries = key == selectedDay ? selectedDayEntries : (byDate[key] ?? [])
            trend.append(DashboardTrendPoint(
                date: day,
                calories: dayEntries.reduce(0) { $0 + $1.totalCalories }
            ))
            for entry in dayEntries {
                let name = entry.displayName
                let running = tally[name] ?? (count: 0, calories: 0)
                tally[name] = (count: running.count + 1, calories: running.calories + entry.totalCalories)
            }
        }
        calorieTrend = trend
        topFoods = Array(
            tally
                .map { DashboardTopFood(name: $0.key, count: $0.value.count, calories: $0.value.calories) }
                .sorted { ($0.count, $0.calories) > ($1.count, $1.calories) }
                .prefix(Self.topFoodsLimit)
        )
    }

    func entryDateCaption(_ isoDate: String) -> String {
        guard let date = DateFormatting.date(from: isoDate) else { return isoDate }
        return DateFormatting.displayString(from: date)
    }

    /// Every trigger — the day buttons, pull-to-refresh, each sheet's dismissal,
    /// the retry button — starts its own task, so several loads can be in
    /// flight at once with no ordering between them. A stale one finishing
    /// last would apply a previous day's result to the day now on screen:
    /// most visibly, turning on the "couldn't refresh" retry state for a day
    /// that loaded fine, or clearing the spinner for a load still running.
    /// Only the newest load writes back.
    ///
    /// `paintFromStore` is the read that renders the cached day before the
    /// refreshes come back — a cold open, a day change or a sheet dismissal
    /// (which leaves an optimistic write in the store) all need it. A
    /// pull-to-refresh doesn't: the store hasn't changed under it and the
    /// screen already shows it, so it skips straight to the network and lets
    /// the single read at the end apply the result.
    func loadData(paintFromStore: Bool = true) async {
        loadGeneration += 1
        let generation = loadGeneration
        let loadDate = dateString
        if paintFromStore { loadFromStore() }
        isLoading = true
        defer {
            if generation == loadGeneration { isLoading = false }
        }

        // Track the entries refresh outcome: a failure that leaves the day
        // empty must surface (retry) rather than masquerade as "No entries yet".
        // `refreshEntries` returns nil on success or a short failure reason.
        async let entriesFailureReason: String? = refreshEntries()
        async let goalsTask: Void? = try? goalsRepository.refresh()
        async let prefsTask: Void? = try? preferencesRepository.refresh()
        async let dayPropsTask: Void? = try? entryRepository.refreshDayProperties(date: dateString)
        // Refresh the supplement list (definitions), not just the checklist
        // (taken-logs): `localChecklist` reads the cached list, so without this
        // the card stays empty — and hidden — until a live checklist call
        // succeeds, which is why it appeared only intermittently.
        async let suppListTask: Void? = try? supplementRepository.refresh()
        async let supplementsTask = try? supplementRepository.refreshChecklist(date: dateString)
        async let weightTask: Void? = try? weightRepository.refresh()
        async let sleepTask: Void? = try? sleepRepository.refresh()
        // Report the device timezone so server-side analytics/MCP use the user's tz.
        async let tzTask: Void? = try? preferencesRepository.reportTimeZone(TimeZone.current.identifier)
        // The trend/top-foods cards read the whole window from the store, so the
        // window has to be cached — a day the user never opened would otherwise
        // read as zero calories. The favorites card needs the same for its list.
        async let trendTask: Void = refreshTrendWindow()
        async let favoritesTask: Void = refreshFavoritesWidget()
        async let recipeSuggestionsTask: Void = refreshRecipeSuggestionsWidget()

        let (entriesFailReason, _, _, _, _, _, _, _) = await (
            entriesFailureReason, goalsTask, prefsTask, dayPropsTask, suppListTask, weightTask, sleepTask, tzTask
        )
        await trendTask
        await favoritesTask
        await recipeSuggestionsTask
        let checklist = await supplementsTask

        guard generation == loadGeneration, dateString == loadDate else { return }
        loadFromStore()
        // Only flag the empty-day error case; a failed refresh that still has
        // cached entries keeps showing them (stale beats blank).
        refreshFailed = entriesFailReason != nil && entries.isEmpty
        if refreshFailed, let entriesFailReason {
            // Whenever the user actually sees the "couldn't refresh" state, log
            // why — at warning level so it bypasses the API layer's noise filter
            // (offline/401/404), which would otherwise leave the failure invisible.
            ErrorReporter.captureWarning(
                "Dashboard entries refresh failed — showing retry",
                context: [
                    "date": dateString,
                    "endpoint": "/api/entries",
                    "reason": entriesFailReason,
                ]
            )
        }
        if let checklist { supplementChecklist = checklist }
    }

    /// Pulls the day's entries. Returns `nil` on success, or a short failure
    /// reason (offline / server_error_500 / decoding_error_200 …) so `loadData`
    /// can distinguish "server says empty" from "couldn't reach server" and
    /// report *why* when it surfaces the error state. A String (not the Error)
    /// is returned so it crosses the `async let` boundary as a Sendable value.
    private func refreshEntries() async -> String? {
        do {
            try await entryRepository.refresh(date: dateString)
            return nil
        } catch {
            let reason = ErrorReporter.reason(for: error)
            // Breadcrumb on every failure (even when stale entries still render),
            // so any later event carries the trail that led to it.
            ErrorReporter.addBreadcrumb(
                "entries refresh failed",
                category: "sync",
                level: .warning,
                data: ["date": dateString, "reason": reason]
            )
            return reason
        }
    }

    /// Caches the trend window's entries. A no-op in Local mode (the store is
    /// already the primary database) and silent on failure — the cards fall
    /// back to whatever is cached rather than showing an error.
    ///
    /// Stops one day short of the selected day: `refreshEntries` owns that day
    /// and both run concurrently. `refreshRange` deletes and re-inserts every
    /// non-pending row in its window, so a slightly older range response that
    /// predates a just-synced entry would drop it until the next refresh, and
    /// whichever of the two landed last would win the row's contents.
    private func refreshTrendWindow() async {
        guard preferences.showChartWidget || preferences.showTopFoodsWidget else { return }
        guard Self.trendWindowDays > 1 else { return }
        let start = selectedDate.adding(days: -(Self.trendWindowDays - 1)).isoDateString
        let end = selectedDate.adding(days: -1).isoDateString
        try? await entryRepository.refreshRange(startDate: start, endDate: end)
    }

    private func refreshFavoritesWidget() async {
        guard preferences.showFavoritesWidget else { return }
        try? await foodRepository.refreshFavorites()
    }

    private func refreshRecipeSuggestionsWidget() async {
        guard preferences.showRecipeSuggestionsWidget else { return }
        try? await recipeRepository.refresh()
    }

    func quickLogFavorite(_ food: Food) async {
        let entry = EntryCreate(
            foodId: food.id,
            mealType: MealTiming.mealForCurrentTime(),
            servings: 1,
            date: dateString
        )
        do {
            try await entryRepository.createEntry(entry, food: food)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = "\(food.name) \(L10n.logged)"
            // Only the day's entries changed — no need to re-read goals,
            // preferences, supplements, weight, sleep and favorites too.
            loadEntriesFromStore()
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToLog
        }
    }

    func copyYesterday() async {
        let yesterday = selectedDate.adding(days: -1).isoDateString
        do {
            let count = try await entryRepository.copyEntries(fromDate: yesterday, toDate: dateString)
            // The copy lands on the selected day, so the trend/top-foods cards
            // have to follow it — assigning `entries` alone left them stale.
            loadEntriesFromStore()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = L10n.entriesCopied(count)
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            toastMessage = L10n.failedToCopy
        }
    }

    func toggleFastingDay() async {
        let newValue = !isFastingDay
        do {
            // Only the flag changes — any notes/water/activity already stored
            // for the day must survive the toggle, so this sets the field
            // rather than deleting the whole row.
            try await entryRepository.setFastingDay(date: dateString, isFastingDay: newValue)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            toastMessage = L10n.error
        }
        isFastingDay = entryRepository.isFastingDay(date: dateString)
    }

    func toggleSupplement(_ item: SupplementChecklist) async {
        let nowTaken = !item.taken
        let previous = supplementChecklist
        // Optimistic UI: flip the checkmark immediately so it feels instant.
        // The repository write is local-first (SwiftData + a queued upload), so
        // there's no need to block on a network checklist refresh — that round
        // trip was the source of the visible lag. `loadData` reconciles with
        // the server on the next appear / pull-to-refresh.
        supplementChecklist = supplementChecklist.map { entry in
            guard entry.supplement.id == item.supplement.id else { return entry }
            return SupplementChecklist(
                supplement: entry.supplement,
                taken: nowTaken,
                takenAt: nowTaken ? DateFormatting.isoDateTimeString(from: Date()) : nil
            )
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        do {
            if nowTaken {
                try await supplementRepository.logSupplement(id: item.supplement.id, date: dateString)
            } else {
                try await supplementRepository.unlogSupplement(id: item.supplement.id, date: dateString)
            }
        } catch {
            supplementChecklist = previous
            toastMessage = L10n.error
        }
    }
}
