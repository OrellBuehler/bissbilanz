@testable import Bissbilanz
import Foundation
import Testing

@Suite("Tab bar layout")
struct TabBarLayoutTests {
    @Test("Raw ids are the vocabulary shared with Android and the web")
    func rawIds() {
        #expect(NavigableTab.allCases.map(\.rawValue) == [
            "foods", "favorites", "recipes", "recipe-suggestions", "insights", "calendar",
            "weight", "sleep", "fasting", "supplements", "ai-tasks",
        ])
    }

    @Test("Only AI tasks needs an account")
    func accountOnlyTabs() {
        #expect(NavigableTab.allCases.filter(\.requiresAccount) == [.aiTasks])
        #expect(!NavigableTab.aiTasks.isAvailable(signedIn: false))
        #expect(NavigableTab.aiTasks.isAvailable(signedIn: true))
        #expect(NavigableTab.recipes.isAvailable(signedIn: false))
    }

    @Test("The stored order is the display order")
    func keepsStoredOrder() {
        let layout = TabBarLayout(raw: "insights,recipes,foods")
        #expect(layout.tabs == [.insights, .recipes, .foods])
        #expect(layout.raw == "insights,recipes,foods")
    }

    @Test("A selection from before reordering survives unchanged")
    func existingSelectionSurvives() {
        #expect(TabBarLayout(raw: TabBarLayout.defaultRaw).tabs == [.foods, .favorites, .insights])
        let older = TabBarLayout(raw: "favorites,weight,recipe-suggestions")
        #expect(older.tabs == [.favorites, .weight, .recipeSuggestions])
    }

    @Test("Unknown ids, blanks and repeats are dropped")
    func dropsUnknownAndRepeats() {
        #expect(TabBarLayout(raw: "foods,chat,,foods,weight").tabs == [.foods, .weight])
        #expect(TabBarLayout(raw: " sleep , ai-tasks ").tabs == [.sleep, .aiTasks])
    }

    @Test("More than the maximum keeps the first ones")
    func capsAtMaximum() {
        #expect(TabBarLayout(raw: "foods,favorites,insights,weight").tabs == [.foods, .favorites, .insights])
    }

    @Test("Nothing usable falls back to the defaults")
    func emptyFallsBack() {
        let defaults: [NavigableTab] = [.foods, .favorites, .insights]
        #expect(TabBarLayout(raw: "").tabs == defaults)
        #expect(TabBarLayout(raw: "chat,unknown").tabs == defaults)
        #expect(TabBarLayout(tabs: []).tabs == defaults)
    }

    @Test("Every tab round-trips through storage")
    func roundTrips() {
        for tab in NavigableTab.allCases {
            #expect(TabBarLayout(raw: TabBarLayout(tabs: [tab]).raw).tabs == [tab])
        }
    }

    @Test("Without an account, account-only tabs are hidden but stay stored")
    func hidesAccountOnlyTabs() {
        let layout = TabBarLayout(raw: "ai-tasks,recipes")
        #expect(layout.visibleTabs(signedIn: false) == [.recipes])
        #expect(layout.visibleTabs(signedIn: true) == [.aiTasks, .recipes])
        #expect(layout.raw == "ai-tasks,recipes")
    }

    @Test("When only account-only tabs are stored, the defaults stand in without an account")
    func defaultsStandInWhenNothingIsLeft() {
        let layout = TabBarLayout(raw: "ai-tasks")
        #expect(layout.visibleTabs(signedIn: false) == [.foods, .favorites, .insights])
        #expect(layout.visibleTabs(signedIn: true) == [.aiTasks])
    }

    @Test("Adding appends up to the maximum")
    func addsAtTheEnd() {
        let two = TabBarLayout(raw: "foods").adding(.recipes, signedIn: true)
        #expect(two.raw == "foods,recipes")
        #expect(two.adding(.aiTasks, signedIn: true).raw == "foods,recipes,ai-tasks")
    }

    @Test("Adding is refused when full, already there, or needing an account")
    func refusesAdding() {
        let full = TabBarLayout(raw: "foods,favorites,insights")
        #expect(!full.canAdd(.recipes, signedIn: true))
        #expect(full.adding(.recipes, signedIn: true) == full)

        let one = TabBarLayout(raw: "foods")
        #expect(!one.canAdd(.foods, signedIn: true))
        #expect(one.adding(.foods, signedIn: true) == one)
        #expect(!one.canAdd(.aiTasks, signedIn: false))
        #expect(one.adding(.aiTasks, signedIn: false) == one)
        #expect(one.canAdd(.aiTasks, signedIn: true))
    }

    @Test("Removing keeps at least one tab")
    func removesDownToOne() {
        let layout = TabBarLayout(raw: "foods,weight")
        let removed = layout.removing(.foods, signedIn: true)
        #expect(removed.raw == "weight")
        #expect(!removed.canRemove(.weight, signedIn: true))
        #expect(removed.removing(.weight, signedIn: true) == removed)
        #expect(!layout.canRemove(.sleep, signedIn: true))
    }

    @Test("Moving follows List.onMove offsets")
    func movesLikeOnMove() {
        let layout = TabBarLayout(raw: "foods,recipes,ai-tasks")
        func move(_ index: Int, to destination: Int) -> TabBarLayout {
            layout.moving(fromOffsets: IndexSet(integer: index), toOffset: destination, signedIn: true)
        }
        #expect(move(0, to: 3).raw == "recipes,ai-tasks,foods")
        #expect(move(2, to: 0).raw == "ai-tasks,foods,recipes")
        #expect(move(0, to: 2).raw == "recipes,foods,ai-tasks")
        #expect(move(1, to: 1) == layout)
        #expect(move(7, to: 0) == layout)
    }

    @Test("Edits without an account keep a hidden tab while there is room")
    func editsKeepHiddenTabs() {
        let layout = TabBarLayout(raw: "foods,ai-tasks")
        let added = layout.adding(.weight, signedIn: false)
        #expect(added.visibleTabs(signedIn: false) == [.foods, .weight])
        #expect(added.raw == "foods,ai-tasks,weight")

        let full = added.adding(.recipes, signedIn: false)
        #expect(full.raw == "foods,weight,recipes")

        let moved = TabBarLayout(raw: "ai-tasks,foods,weight").moving(
            fromOffsets: IndexSet(integer: 1), toOffset: 0, signedIn: false
        )
        #expect(moved.raw == "ai-tasks,weight,foods")
    }

    @Test("An edit from the stand-in defaults keeps the hidden tab while there is room")
    func editFromStandInDefaults() {
        // Without an account the bar shows the defaults in place of ai-tasks;
        // removing one of them stores the two that are left and keeps ai-tasks
        // in front, where it was, so it returns on sign-in.
        let removed = TabBarLayout(raw: "ai-tasks").removing(.insights, signedIn: false)
        #expect(removed.raw == "ai-tasks,foods,favorites")
        #expect(removed.visibleTabs(signedIn: false) == [.foods, .favorites])
        #expect(removed.visibleTabs(signedIn: true) == [.aiTasks, .foods, .favorites])
    }

    @Test("Removing the landing tab sends the app back to Home")
    func removingLandingTabResetsIt() {
        #expect(TabBarLayout.landing("recipes", afterRemoving: .recipes) == TabBarLayout.homeId)
        #expect(TabBarLayout.landing("recipes", afterRemoving: .foods) == "recipes")
        #expect(TabBarLayout.landing(TabBarLayout.homeId, afterRemoving: .foods) == TabBarLayout.homeId)
    }

    @Test("The stored landing tab is read from defaults with the same fallback")
    func storedLandingTab() throws {
        let suite = "TabBarLayoutTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        #expect(TabBarLayout.storedLandingTab(defaults: defaults, signedIn: true) == TabBarLayout.homeId)
        defaults.set("insights", forKey: TabBarLayout.landingStorageKey)
        #expect(TabBarLayout.storedLandingTab(defaults: defaults, signedIn: true) == "insights")
        defaults.set("recipes,ai-tasks", forKey: TabBarLayout.storageKey)
        #expect(TabBarLayout.storedLandingTab(defaults: defaults, signedIn: true) == TabBarLayout.homeId)
        defaults.set("ai-tasks", forKey: TabBarLayout.landingStorageKey)
        #expect(TabBarLayout.storedLandingTab(defaults: defaults, signedIn: true) == "ai-tasks")
        #expect(TabBarLayout.storedLandingTab(defaults: defaults, signedIn: false) == TabBarLayout.homeId)
    }

    @Test("The widgets' plain tap opens Home and is not a sheet link")
    func todayLinkOpensHome() throws {
        let today = try #require(URL(string: "bissbilanz://today"))
        let log = try #require(URL(string: "bissbilanz://log"))
        let web = try #require(URL(string: "https://today"))
        #expect(DeepLink.opensHome(today))
        #expect(DeepLink.parse(today) == nil)
        #expect(!DeepLink.opensHome(log))
        #expect(!DeepLink.opensHome(web))
    }

    @Test("The landing tab falls back to Home when the bar does not show it")
    func landingFallsBackToHome() {
        let layout = TabBarLayout(raw: "recipes,ai-tasks")
        #expect(layout.landingTab("recipes", signedIn: true) == "recipes")
        #expect(layout.landingTab("ai-tasks", signedIn: true) == "ai-tasks")
        #expect(layout.landingTab("ai-tasks", signedIn: false) == TabBarLayout.homeId)
        #expect(layout.landingTab("weight", signedIn: true) == TabBarLayout.homeId)
        #expect(layout.landingTab(TabBarLayout.settingsId, signedIn: true) == TabBarLayout.homeId)
        #expect(layout.landingTab("", signedIn: true) == TabBarLayout.homeId)
    }

    @Test("The selection keeps the user's tab while it exists, otherwise the landing tab")
    func selectionFallsBack() {
        let layout = TabBarLayout(raw: "recipes,ai-tasks")
        let home = TabBarLayout.homeId
        let settings = TabBarLayout.settingsId
        #expect(layout.selection(current: nil, landing: "recipes", signedIn: true) == "recipes")
        #expect(layout.selection(current: settings, landing: "recipes", signedIn: true) == settings)
        #expect(layout.selection(current: home, landing: "recipes", signedIn: true) == home)
        #expect(layout.selection(current: "ai-tasks", landing: "recipes", signedIn: true) == "ai-tasks")
        #expect(layout.selection(current: "ai-tasks", landing: "recipes", signedIn: false) == "recipes")
        #expect(layout.selection(current: "weight", landing: "weight", signedIn: true) == home)
    }
}

@Suite("AI tasks tab badge")
struct AiTaskAttentionCountTests {
    private static func task(
        id: String,
        status: String = "completed",
        acknowledgedAt: String? = "2026-11-01T12:00:00Z",
        processing: AiTaskClaudeProcessing? = nil,
        thread: AiTaskClaudeThread? = nil
    ) -> AiTask {
        AiTask(
            id: id, userId: "u1", status: status, description: "pasta", photoUrl: nil, photoUrls: [],
            date: "2026-11-01", mealType: "Dinner", eatenAt: nil, source: nil, resultSummary: nil,
            createdEntryIds: nil, completedAt: nil, dismissedAt: nil, acknowledgedAt: acknowledgedAt,
            processedBy: nil, createdAt: nil, updatedAt: nil, claudeProcessing: processing, claudeThread: thread
        )
    }

    private static func thread(unread: Bool) -> AiTaskClaudeThread {
        let answer = AiTaskThreadMessage(
            id: "m1", role: "assistant", text: "Done", outcome: "answered", createdAt: "2026-11-01T12:00:00Z",
            unread: unread
        )
        return AiTaskClaudeThread(
            messages: [answer], correctionState: "idle", canReply: true, replyBlockedReason: nil,
            repliesRemaining: 5, unreadReplies: unread ? 1 : 0
        )
    }

    private static let proposed = AiTaskClaudeProcessing(
        state: "proposed", proposal: AiTaskProposal(summary: nil, items: [])
    )

    private static func upload(_ state: PendingAiTaskUpload.State) -> PendingAiTaskUpload {
        PendingAiTaskUpload(
            id: UUID(), description: "soup", photoCount: 0, date: "2026-11-01", mealType: nil, eatenAt: nil,
            state: state
        )
    }

    @Test("Nothing waiting is zero")
    func nothingWaiting() {
        let tasks = [
            Self.task(id: "a"),
            Self.task(id: "b", status: "pending", acknowledgedAt: nil),
            Self.task(id: "c", thread: Self.thread(unread: false)),
        ]
        #expect(AiTaskStore.attentionCount(tasks: tasks, uploads: [Self.upload(.sending)]) == 0)
    }

    @Test("Counts unread dismissals and answers, proposals and failed uploads")
    func countsWhatWaits() {
        let tasks = [
            Self.task(id: "a", status: "dismissed", acknowledgedAt: nil),
            Self.task(id: "b", thread: Self.thread(unread: true)),
            Self.task(id: "c", status: "pending", acknowledgedAt: nil, processing: Self.proposed),
            Self.task(id: "d"),
        ]
        let uploads = [Self.upload(.failed("Offline", retryable: true)), Self.upload(.sending)]
        #expect(AiTaskStore.attentionCount(tasks: tasks, uploads: uploads) == 4)
    }

    @Test("A task with several reasons counts once")
    func countsTaskOnce() {
        let tasks = [Self.task(id: "a", status: "dismissed", acknowledgedAt: nil, thread: Self.thread(unread: true))]
        #expect(AiTaskStore.attentionCount(tasks: tasks, uploads: []) == 1)
    }

    @Test("A proposed state on a task that is no longer pending does not count")
    func staleProposalDoesNotCount() {
        let tasks = [Self.task(id: "a", status: "completed", processing: Self.proposed)]
        #expect(AiTaskStore.attentionCount(tasks: tasks, uploads: []) == 0)
        #expect(AiTaskThreadChanges.statusWithNews(in: tasks) == nil)
    }

    @Test("Only failed uploads count as failed")
    func failedUploads() {
        let uploads = [Self.upload(.sending), Self.upload(.failed("Offline", retryable: false))]
        #expect(AiTaskStore.failedUploadCount(in: uploads) == 1)
        #expect(AiTaskStore.failedUploadCount(in: [Self.upload(.sending)]) == 0)
    }

    @Test("The list opens on Open when only a proposal waits, after dismissals and answers")
    func proposalNewsIsPending() {
        let proposal = Self.task(id: "p", status: "pending", acknowledgedAt: nil, processing: Self.proposed)
        let answered = Self.task(id: "b", thread: Self.thread(unread: true))
        let dismissal = Self.task(id: "a", status: "dismissed", acknowledgedAt: nil)
        #expect(AiTaskThreadChanges.statusWithNews(in: [proposal]) == "pending")
        #expect(AiTaskThreadChanges.statusWithNews(in: [proposal, answered]) == "completed")
        #expect(AiTaskThreadChanges.statusWithNews(in: [proposal, dismissal]) == "dismissed")
    }
}
