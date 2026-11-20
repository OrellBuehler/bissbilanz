import Foundation

/// Pulls what a `ChatRefreshPlan` names through the existing repository
/// refreshes, the narrowest each allows: a day per date, a food per id, the
/// recipe list (it also drops deleted recipes), and a whole domain otherwise.
/// Every step stands alone; a failure leaves a breadcrumb (the request already
/// reported itself) and the rest still run. Each step first checks the plan
/// still belongs to the signed-in account. All of it no-ops in Local mode.
@MainActor
struct ChatDataRefresher {
    let entryRepository: EntryRepository
    let foodRepository: FoodRepository
    let recipeRepository: RecipeRepository
    let goalsRepository: GoalsRepository
    let weightRepository: WeightRepository
    let sleepRepository: SleepRepository
    let supplementRepository: SupplementRepository
    let reminderRepository: ReminderRepository
    let preferencesRepository: PreferencesRepository
    let fastingManager: FastingTimerManager

    /// How far back an unscoped entries change is pulled.
    static let recentDays = 14

    func run(_ plan: ChatRefreshPlan, today: Date = Date(), isCurrent: @MainActor () -> Bool) async {
        let todayString = today.isoDateString
        let recentStart = DateFormatting.isoDay(daysBefore: Self.recentDays - 1, from: today)
        await refreshEntries(plan, today: todayString, recentStart: recentStart, isCurrent: isCurrent)
        var dayPropertyDates = plan.dayPropertyDates
        if plan.recentDayProperties {
            dayPropertyDates.insert(todayString)
        }
        for date in dayPropertyDates.sorted() {
            await step("day_properties", isCurrent) { try await entryRepository.refreshDayProperties(date: date) }
        }
        await refreshFoods(plan, isCurrent: isCurrent)
        if plan.allRecipes || !plan.recipeIds.isEmpty {
            await step("recipes", isCurrent) { try await recipeRepository.refresh() }
        }
        if plan.goals {
            await step("goals", isCurrent) { try await goalsRepository.refresh() }
        }
        if plan.weight {
            await step("weight", isCurrent) { try await weightRepository.refresh() }
        }
        if plan.sleep {
            await step("sleep", isCurrent) { try await sleepRepository.refresh() }
        }
        if plan.supplements {
            await refreshSupplements(plan, today: todayString, isCurrent: isCurrent)
        }
        if plan.fasting {
            await step("fasting", isCurrent) { await fastingManager.refreshFromServer() }
        }
        if plan.reminders {
            await step("reminders", isCurrent) { try await reminderRepository.refresh() }
        }
        if plan.reminders || plan.supplements || plan.weight || plan.sleep {
            await rescheduleReminders(isCurrent: isCurrent)
        }
        if plan.preferences {
            await step("preferences", isCurrent) { try await preferencesRepository.refresh() }
        }
    }

    /// The days named, the recent window for an unscoped change, and the
    /// recent days whose entries use a food or recipe that changed (their
    /// macros come from it), including recipes that use a changed food.
    private func refreshEntries(
        _ plan: ChatRefreshPlan,
        today: String,
        recentStart: String,
        isCurrent: @MainActor () -> Bool
    ) async {
        var dates = plan.entryDates
        let usedBy = datesUsing(foodIds: plan.foodIds, recipeIds: plan.recipeIds)
        dates.formUnion(usedBy.filter { $0 >= recentStart && $0 <= today })
        if plan.recentEntries || plan.allFoods || plan.allRecipes {
            await step("entries_recent", isCurrent) {
                try await entryRepository.refreshRange(startDate: recentStart, endDate: today)
            }
            dates = dates.filter { $0 < recentStart || $0 > today }
        }
        for date in dates.sorted() {
            await step("entries", isCurrent) { try await entryRepository.refresh(date: date) }
        }
    }

    private func datesUsing(foodIds: Set<String>, recipeIds: Set<String>) -> Set<String> {
        guard !foodIds.isEmpty || !recipeIds.isEmpty else { return [] }
        var recipes = recipeIds
        if !foodIds.isEmpty {
            for recipe in recipeRepository.recipes()
                where (recipe.ingredients ?? []).contains(where: { foodIds.contains($0.foodId) })
            {
                recipes.insert(recipe.id)
            }
        }
        return entryRepository.localDates(referencingFoodIds: foodIds)
            .union(entryRepository.localDates(referencingRecipeIds: recipes))
    }

    private func refreshFoods(_ plan: ChatRefreshPlan, isCurrent: @MainActor () -> Bool) async {
        if plan.allFoods {
            await step("foods_all", isCurrent) { try await foodRepository.mirrorAll() }
            await step("favorites", isCurrent) { try await foodRepository.refreshFavorites() }
            return
        }
        for id in plan.foodIds.sorted() {
            await step("food", isCurrent) { try await foodRepository.refreshFood(id: id) }
        }
    }

    private func refreshSupplements(_ plan: ChatRefreshPlan, today: String, isCurrent: @MainActor () -> Bool) async {
        await step("supplements", isCurrent) { try await supplementRepository.refresh() }
        let dates = Set([today]).union(plan.entryDates).sorted().suffix(7)
        for date in dates {
            await step("supplement_checklist", isCurrent) {
                _ = try await supplementRepository.refreshChecklist(date: date)
            }
        }
    }

    /// The same refill the app runs on activation: reminder and supplement
    /// times as they are now, logging reminders skipped for what is logged.
    private func rescheduleReminders(isCurrent: @MainActor () -> Bool) async {
        guard isCurrent() else { return }
        await SupplementReminderScheduler.refill(
            supplementRepository: supplementRepository,
            reminders: ReminderScheduler.SchedulingDependencies(
                reminderRepository: reminderRepository,
                weightRepository: weightRepository,
                sleepRepository: sleepRepository,
                entryRepository: entryRepository
            )
        )
    }

    private func step(
        _ name: String,
        _ isCurrent: @MainActor () -> Bool,
        _ work: @MainActor () async throws -> Void
    ) async {
        guard isCurrent() else { return }
        do {
            try await work()
        } catch {
            ErrorReporter.addBreadcrumb(
                "Chat data refresh failed",
                category: "chat",
                level: .warning,
                data: ["step": name, "reason": ErrorReporter.reason(for: error)]
            )
        }
    }
}
