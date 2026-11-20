import Foundation

/// Pulls what a `ChatRefreshPlan` names through the existing repository
/// refreshes, the narrowest each allows: a day per date, a food per id, the
/// recipe list (it also drops deleted recipes), and a whole domain otherwise.
/// Every step stands alone; a failure leaves a breadcrumb (the request already
/// reported itself) and the rest still run. All of it no-ops in Local mode.
@MainActor
struct ChatDataRefresher {
    let entryRepository: EntryRepository
    let foodRepository: FoodRepository
    let recipeRepository: RecipeRepository
    let goalsRepository: GoalsRepository
    let weightRepository: WeightRepository
    let sleepRepository: SleepRepository
    let supplementRepository: SupplementRepository
    let preferencesRepository: PreferencesRepository

    /// How far back an unscoped entries change is pulled.
    static let recentDays = 14

    func run(_ plan: ChatRefreshPlan, today: Date = Date()) async {
        let todayString = today.isoDateString
        let recentStart = DateFormatting.isoDay(daysBefore: Self.recentDays - 1, from: today)
        await refreshEntries(plan, today: todayString, recentStart: recentStart)
        var dayPropertyDates = plan.dayPropertyDates
        if plan.recentDayProperties {
            dayPropertyDates.insert(todayString)
        }
        for date in dayPropertyDates.sorted() {
            await step("day_properties") { try await entryRepository.refreshDayProperties(date: date) }
        }
        await refreshFoods(plan)
        if plan.allRecipes || !plan.recipeIds.isEmpty {
            await step("recipes") { try await recipeRepository.refresh() }
        }
        if plan.goals {
            await step("goals") { try await goalsRepository.refresh() }
        }
        if plan.weight {
            await step("weight") { try await weightRepository.refresh() }
        }
        if plan.sleep {
            await step("sleep") { try await sleepRepository.refresh() }
        }
        if plan.supplements {
            await refreshSupplements(plan, today: todayString)
        }
        if plan.preferences {
            await step("preferences") { try await preferencesRepository.refresh() }
        }
    }

    /// The days named, the recent window for an unscoped change, and the
    /// recent days whose entries use a food that changed (their macros come
    /// from the food).
    private func refreshEntries(_ plan: ChatRefreshPlan, today: String, recentStart: String) async {
        var dates = plan.entryDates
        if !plan.foodIds.isEmpty {
            let usingFoods = entryRepository.localDates(referencingFoodIds: plan.foodIds)
            dates.formUnion(usingFoods.filter { $0 >= recentStart && $0 <= today })
        }
        if plan.recentEntries {
            await step("entries_recent") {
                try await entryRepository.refreshRange(startDate: recentStart, endDate: today)
            }
            dates = dates.filter { $0 < recentStart || $0 > today }
        }
        for date in dates.sorted() {
            await step("entries") { try await entryRepository.refresh(date: date) }
        }
    }

    private func refreshFoods(_ plan: ChatRefreshPlan) async {
        if plan.allFoods {
            await step("foods_all") { try await foodRepository.mirrorAll() }
            await step("favorites") { try await foodRepository.refreshFavorites() }
            return
        }
        for id in plan.foodIds.sorted() {
            await step("food") { try await foodRepository.refreshFood(id: id) }
        }
    }

    private func refreshSupplements(_ plan: ChatRefreshPlan, today: String) async {
        await step("supplements") { try await supplementRepository.refresh() }
        let dates = Set([today]).union(plan.entryDates).sorted().suffix(7)
        for date in dates {
            await step("supplement_checklist") { _ = try await supplementRepository.refreshChecklist(date: date) }
        }
    }

    private func step(_ name: String, _ work: @MainActor () async throws -> Void) async {
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
