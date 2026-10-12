@testable import Bissbilanz
import Foundation
import Testing

@Suite("Claude processing models")
struct ClaudeProcessingTests {
    private static let minimalTask = """
    {
        "id": "t1", "userId": "u1", "status": "pending", "photoUrls": [], "date": "2026-10-12"
    }
    """

    private static func taskJSON(status: String = "pending", extra: String) -> Data {
        Data("""
        {
            "id": "t1", "userId": "u1", "status": "\(status)", "photoUrls": [], "date": "2026-10-12",
            \(extra)
        }
        """.utf8)
    }

    private static func task(
        status: String = "pending",
        processedByKind: String? = nil,
        claudeProcessing: AiTaskClaudeProcessing? = nil
    ) -> AiTask {
        AiTask(
            id: "t1", userId: "u1", status: status, description: nil, photoUrl: nil, photoUrls: [],
            date: "2026-10-12", mealType: nil, eatenAt: nil, source: nil, resultSummary: nil,
            createdEntryIds: nil, completedAt: nil, dismissedAt: nil, acknowledgedAt: nil, processedBy: nil,
            createdAt: nil, updatedAt: nil, processedByKind: processedByKind, claudeProcessing: claudeProcessing
        )
    }

    private static let item = AiTaskProposalItem(
        id: "i1", name: "Egg", quantityDescription: "2 eggs", foodId: "f1", recipeId: nil,
        servings: 2, calories: 156, protein: 12.6, carbs: 1.2, fat: 10.6, fiber: 0
    )

    private static func proposed() -> AiTaskClaudeProcessing {
        AiTaskClaudeProcessing(state: "proposed", proposal: AiTaskProposal(summary: "Eggs", items: [item]))
    }

    // MARK: - AiTask decoding

    @Test("A task without any Claude fields still decodes")
    func decodesTaskWithoutClaudeFields() throws {
        let task = try JSONDecoder().decode(AiTask.self, from: Data(Self.minimalTask.utf8))
        #expect(task.processedByKind == nil)
        #expect(task.claudeProcessing == nil)
        #expect(task.openProposal == nil)
    }

    @Test("A task with explicit nulls decodes")
    func decodesTaskWithNullClaudeFields() throws {
        let data = Self.taskJSON(extra: #""processedByKind": null, "claudeProcessing": null"#)
        let task = try JSONDecoder().decode(AiTask.self, from: data)
        #expect(task.processedByKind == nil)
        #expect(task.claudeProcessing == nil)
    }

    @Test("A proposed task decodes its items and macros")
    func decodesProposal() throws {
        let data = Self.taskJSON(extra: """
        "processedByKind": null,
        "claudeProcessing": {
            "state": "proposed",
            "proposal": {
                "summary": "Two eggs and a slice of toast",
                "items": [{
                    "id": "i1", "name": "Egg", "quantityDescription": "2 eggs", "foodId": "f1", "recipeId": null,
                    "servings": 2, "calories": 156, "protein": 12.6, "carbs": 1.2, "fat": 10.6, "fiber": 0
                }, {
                    "id": "i2", "name": "Toast", "quantityDescription": null, "foodId": null, "recipeId": "r1",
                    "servings": 1, "calories": 80, "protein": 3, "carbs": 15, "fat": 1, "fiber": 1.5
                }]
            }
        }
        """)
        let task = try JSONDecoder().decode(AiTask.self, from: data)
        let proposal = try #require(task.openProposal)
        #expect(proposal.summary == "Two eggs and a slice of toast")
        #expect(proposal.items.map(\.id) == ["i1", "i2"])
        #expect(proposal.items[0].foodId == "f1")
        #expect(proposal.items[0].recipeId == nil)
        #expect(proposal.items[1].quantityDescription == nil)
        #expect(proposal.items[1].recipeId == "r1")
        #expect(proposal.items[0].protein == 12.6)
    }

    @Test("An unknown state and an unknown processedByKind decode without failing")
    func decodesUnknownStrings() throws {
        let data = Self.taskJSON(extra: """
        "processedByKind": "quantum",
        "claudeProcessing": { "state": "meditating", "proposal": null }
        """)
        let task = try JSONDecoder().decode(AiTask.self, from: data)
        #expect(task.processedByKind == "quantum")
        #expect(task.isProcessedByClaude == false)
        #expect(task.claudeProcessing?.state == "meditating")
        #expect(AiTaskClaudeState.display(for: task, processorIsClaude: true) == .other)
        #expect(task.openProposal == nil)
    }

    @Test("The accept body omits itemIds for accept-all and lists them otherwise")
    func acceptBodyEncoding() throws {
        let all = try JSONEncoder().encode(AiTaskProposalAccept(itemIds: nil))
        #expect(String(decoding: all, as: UTF8.self) == "{}")
        let some = try JSONEncoder().encode(AiTaskProposalAccept(itemIds: ["i1"]))
        #expect(String(decoding: some, as: UTF8.self) == #"{"itemIds":["i1"]}"#)
    }

    // MARK: - Status and badge logic

    @Test("State strings map to states and unknown ones to other")
    func stateMapping() {
        #expect(AiTaskClaudeState(rawState: "queued") == .queued)
        #expect(AiTaskClaudeState(rawState: "running") == .running)
        #expect(AiTaskClaudeState(rawState: "retrying") == .retrying)
        #expect(AiTaskClaudeState(rawState: "proposed") == .proposed)
        #expect(AiTaskClaudeState(rawState: "blocked") == .blocked)
        #expect(AiTaskClaudeState(rawState: "later") == .other)
        #expect(AiTaskClaudeState(rawState: nil) == nil)
    }

    @Test("A pending task shows its run state, or queued while Claude is the processor")
    func displayState() {
        let running = Self.task(claudeProcessing: AiTaskClaudeProcessing(state: "running", proposal: nil))
        #expect(AiTaskClaudeState.display(for: running, processorIsClaude: false) == .running)
        #expect(AiTaskClaudeState.display(for: running, processorIsClaude: true) == .running)

        let noRun = Self.task()
        #expect(AiTaskClaudeState.display(for: noRun, processorIsClaude: true) == .queued)
        #expect(AiTaskClaudeState.display(for: noRun, processorIsClaude: false) == nil)

        let finished = AiTaskClaudeProcessing(state: "running", proposal: nil)
        let done = Self.task(status: "completed", claudeProcessing: finished)
        #expect(AiTaskClaudeState.display(for: done, processorIsClaude: true) == nil)
    }

    @Test("Processed by Claude needs a resolved task: a reopened pending task keeps its stale kind")
    func processedByClaudeBadge() {
        #expect(Self.task(status: "completed", processedByKind: "claude").isProcessedByClaude)
        #expect(Self.task(status: "dismissed", processedByKind: "claude").isProcessedByClaude)
        #expect(Self.task(status: "pending", processedByKind: "claude").isProcessedByClaude == false)
        #expect(Self.task(status: "completed", processedByKind: "on_device").isProcessedByClaude == false)
        #expect(Self.task(status: "completed", processedByKind: nil).isProcessedByClaude == false)
    }

    @Test("A proposal is only open on a pending task in the proposed state")
    func openProposalGate() {
        #expect(Self.task(claudeProcessing: Self.proposed()).openProposal != nil)
        #expect(Self.task(status: "completed", claudeProcessing: Self.proposed()).openProposal == nil)
        let running = AiTaskClaudeProcessing(
            state: "running", proposal: AiTaskProposal(summary: nil, items: [Self.item])
        )
        #expect(Self.task(claudeProcessing: running).openProposal == nil)
        let empty = AiTaskClaudeProcessing(state: "proposed", proposal: nil)
        #expect(Self.task(claudeProcessing: empty).openProposal == nil)
    }

    // MARK: - Selection

    @Test("Selected ids come back in proposal order and skip unknown ids")
    func selectionIds() {
        let second = AiTaskProposalItem(
            id: "i2", name: "Toast", quantityDescription: nil, foodId: nil, recipeId: nil,
            servings: 1, calories: 80, protein: 3, carbs: 15, fat: 1, fiber: 1
        )
        let items = [Self.item, second]
        #expect(AiTaskProposalSelection.itemIds(items: items, selected: ["i2", "i1", "gone"]) == ["i1", "i2"])
        #expect(AiTaskProposalSelection.itemIds(items: items, selected: ["i2"]) == ["i2"])
        #expect(AiTaskProposalSelection.itemIds(items: items, selected: []).isEmpty)
    }

    @Test("Toggling adds a missing id and removes a present one")
    func selectionToggle() {
        #expect(AiTaskProposalSelection.toggled("a", in: []) == ["a"])
        #expect(AiTaskProposalSelection.toggled("a", in: ["a", "b"]) == ["b"])
    }

    @Test("Macro numbers drop a trailing .0 and keep one decimal otherwise")
    func macroFormat() {
        #expect(AiTaskProposalSelection.format(156) == "156")
        #expect(AiTaskProposalSelection.format(12.6) == "12.6")
        #expect(AiTaskProposalSelection.format(.nan).isEmpty == false)
    }

    @Test("Only a 409 counts as an accept conflict")
    func conflictClassification() {
        #expect(AiTaskStore.isConflict(APIError.conflict(serverNewer: false, body: nil)))
        #expect(AiTaskStore.isConflict(APIError.notFound) == false)
        #expect(AiTaskStore.isConflict(APIError.serverError(500, nil)) == false)
        #expect(AiTaskStore.isConflict(URLError(.notConnectedToInternet)) == false)
    }
}

@Suite("Claude preferences and capability")
struct ClaudePreferencesTests {
    private static let baseJSON = """
    "showChartWidget": true, "showFavoritesWidget": true, "showSupplementsWidget": true,
    "showWeightWidget": true, "showMealBreakdownWidget": true, "showTopFoodsWidget": true,
    "showSleepWidget": true, "widgetOrder": [], "startPage": "dashboard", "favoriteTapAction": "instant",
    "favoriteMealAssignmentMode": "time_based", "visibleNutrients": [], "locale": null, "timeZone": "UTC"
    """

    private static func preferences(_ extra: String) throws -> Preferences {
        let json = "{ \(baseJSON)\(extra.isEmpty ? "" : ", \(extra)") }"
        return try JSONDecoder().decode(Preferences.self, from: Data(json.utf8))
    }

    @Test("Preferences without the kind decode and use the legacy field")
    func decodesWithoutKind() throws {
        let prefs = try Self.preferences(#""aiTaskProcessor": "device""#)
        #expect(prefs.aiTaskProcessorKind == nil)
        #expect(prefs.effectiveAiTaskProcessor == "device")
        #expect(try Self.preferences("").effectiveAiTaskProcessor == "assistant")
    }

    @Test("The kind wins over the legacy field")
    func kindWins() throws {
        let prefs = try Self.preferences(#""aiTaskProcessor": "assistant", "aiTaskProcessorKind": "claude""#)
        #expect(prefs.aiTaskProcessorKind == "claude")
        #expect(prefs.effectiveAiTaskProcessor == "claude")
        let device = try Self.preferences(#""aiTaskProcessor": "device", "aiTaskProcessorKind": "device""#)
        #expect(device.effectiveAiTaskProcessor == "device")
    }

    @Test("An unknown kind decodes and falls back to the legacy field, never to the device")
    func unknownKindFallsBack() throws {
        let prefs = try Self.preferences(#""aiTaskProcessor": "assistant", "aiTaskProcessorKind": "gemini""#)
        #expect(prefs.aiTaskProcessorKind == "gemini")
        #expect(prefs.effectiveAiTaskProcessor == "assistant")
        #expect(Preferences.effectiveAiTaskProcessor(kind: "gemini", legacy: "device") == "device")
    }

    @Test("The kind survives an encode and decode round trip, and is omitted when nil")
    func kindRoundTrip() throws {
        var prefs = Preferences.defaults
        prefs.aiTaskProcessorKind = "claude"
        let data = try JSONEncoder().encode(prefs)
        #expect(try JSONDecoder().decode(Preferences.self, from: data).aiTaskProcessorKind == "claude")
        let bare = try JSONEncoder().encode(Preferences.defaults)
        #expect(!String(decoding: bare, as: UTF8.self).contains("aiTaskProcessorKind"))
    }

    @Test("Claude maps to the assistant in the legacy field and other kinds pass through")
    func legacyMapping() {
        #expect(Preferences.legacyAiTaskProcessor(forKind: "claude") == "assistant")
        #expect(Preferences.legacyAiTaskProcessor(forKind: "device") == "device")
        #expect(Preferences.legacyAiTaskProcessor(forKind: "assistant") == "assistant")
    }

    @Test("The response envelope decodes with, without and with an unavailable capability")
    func envelope() throws {
        let prefs = try String(decoding: JSONEncoder().encode(Preferences.defaults), as: UTF8.self)
        func decode(_ claude: String) throws -> PreferencesResponse {
            let json = "{ \"preferences\": \(prefs)\(claude) }"
            return try JSONDecoder().decode(PreferencesResponse.self, from: Data(json.utf8))
        }
        #expect(try decode("").claude == nil)
        #expect(try decode(#", "claude": null"#).claude == nil)
        let available = try decode(#", "claude": { "available": true, "remainingBudgetUsd": 8.31 }"#).claude
        #expect(available == ClaudeCapability(available: true, remainingBudgetUsd: 8.31))
        let unavailable = try decode(#", "claude": { "available": false }"#).claude
        #expect(unavailable == ClaudeCapability(available: false, remainingBudgetUsd: nil))
    }

    // MARK: - Picker availability

    @Test("Claude is offered only while available, and stays visible as unavailable when it is the choice")
    func optionResolution() {
        let available = ClaudeCapability(available: true, remainingBudgetUsd: 3)
        let unavailable = ClaudeCapability(available: false)
        #expect(ClaudeProcessorOption.resolve(effective: "assistant", capability: available) == .selectable)
        #expect(ClaudeProcessorOption.resolve(effective: "claude", capability: available) == .selectable)
        #expect(ClaudeProcessorOption.resolve(effective: "assistant", capability: unavailable) == .hidden)
        #expect(ClaudeProcessorOption.resolve(effective: "device", capability: nil) == .hidden)
        #expect(ClaudeProcessorOption.resolve(effective: "claude", capability: unavailable) == .unavailable)
        #expect(ClaudeProcessorOption.resolve(effective: "claude", capability: nil) == .unavailable)
    }

    @Test("Claude is active only when chosen and available")
    func activeResolution() {
        let available = ClaudeCapability(available: true)
        #expect(ClaudeProcessorOption.isActive(effective: "claude", capability: available))
        #expect(!ClaudeProcessorOption.isActive(effective: "claude", capability: ClaudeCapability(available: false)))
        #expect(!ClaudeProcessorOption.isActive(effective: "claude", capability: nil))
        #expect(!ClaudeProcessorOption.isActive(effective: "device", capability: available))
    }

    @Test("A claude-routed task is never the device's: only the device kind enables on-device processing")
    func claudeIsNeverDevice() {
        let device = Preferences.aiTaskProcessorDevice
        for kind in ["claude", "assistant", "gemini"] {
            #expect(Preferences.effectiveAiTaskProcessor(kind: kind, legacy: "assistant") != device)
        }
        #expect(Preferences.effectiveAiTaskProcessor(kind: "device", legacy: "device") == device)
    }

    // MARK: - Capability storage

    @Test("The capability round trips through its stored JSON, and bad data reads as unknown")
    func capabilityStorage() {
        let capability = ClaudeCapability(available: true, remainingBudgetUsd: 4.2)
        let data = PreferencesRepository.encodeCapability(capability)
        #expect(PreferencesRepository.decodeCapability(data) == capability)
        #expect(PreferencesRepository.encodeCapability(nil) == nil)
        #expect(PreferencesRepository.decodeCapability(nil) == nil)
        #expect(PreferencesRepository.decodeCapability(Data("not json".utf8)) == nil)
    }

    // MARK: - Money

    @Test("USD is formatted with two decimals in the UI locale")
    func usdFormatting() {
        #expect(L10n.formatUsd(4.2, locale: Locale(identifier: "en")) == "$4.20")
        let german = L10n.formatUsd(4.2, locale: Locale(identifier: "de"))
        #expect(german.contains("4,20"))
        #expect(german.contains("$"))
        #expect(L10n.formatUsd(8, locale: Locale(identifier: "en")) == "$8.00")
    }
}
