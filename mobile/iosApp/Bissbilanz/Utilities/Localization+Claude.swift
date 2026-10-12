import Foundation

// Strings for the server-side Claude processor (picker option, privacy and
// budget copy, task status chips, the proposal review card). Same keys as the
// web and Android clients. Kept in their own file for the same merge-conflict
// reason as `Localization+AiTaskProcessor.swift`.
extension L10n {
    static var aiTaskProcessorOptionClaude: String {
        localized("settings_ai_task_processor_claude", en: "Claude (automatic)", de: "Claude (automatisch)")
    }

    static var aiTaskProcessorOptionClaudeUnavailable: String {
        localized(
            "settings_ai_task_processor_claude_unavailable",
            en: "Claude (unavailable)",
            de: "Claude (nicht verfügbar)"
        )
    }

    static var aiTaskProcessorClaudePrivacy: String {
        localized(
            "settings_ai_task_processor_claude_privacy",
            en: "Meal descriptions and photos are sent to Anthropic to be processed by Claude.",
            de: "Mahlzeitbeschreibungen und Fotos werden zur Verarbeitung durch Claude an Anthropic gesendet."
        )
    }

    static var aiTaskProcessorClaudeUnavailableHint: String {
        localized(
            "settings_ai_task_processor_claude_unavailable_hint",
            en: "Claude is not available for your account right now. Queued meals wait until it is back or for " +
                "your AI assistant.",
            de: "Claude ist für dein Konto gerade nicht verfügbar. Erfasste Mahlzeiten warten, bis es wieder " +
                "verfügbar ist, oder auf deinen KI-Assistenten."
        )
    }

    static func aiTaskProcessorClaudeRemaining(_ usd: Double) -> String {
        let amount = formatUsd(usd, locale: Locale(identifier: currentLocale.rawValue))
        return localized(
            "settings_ai_task_processor_claude_remaining",
            en: "\(amount) left this month",
            de: "Diesen Monat noch \(amount)"
        )
    }

    /// USD with exactly two decimals in the given locale (`$4.20`, `4,20 $`).
    static func formatUsd(_ value: Double, locale: Locale) -> String {
        value.formatted(.currency(code: "USD").precision(.fractionLength(2)).locale(locale))
    }

    static var aiTasksProcessedByClaude: String {
        localized("ai_tasks_processed_by_claude", en: "Processed by Claude", de: "Von Claude verarbeitet")
    }

    static func aiTasksClaudeState(_ state: AiTaskClaudeState) -> String {
        switch state {
        case .queued, .other:
            localized("ai_tasks_claude_state_queued", en: "Waiting for Claude", de: "Wartet auf Claude")
        case .running:
            localized(
                "ai_tasks_claude_state_running",
                en: "Claude is processing this meal",
                de: "Claude verarbeitet diese Mahlzeit"
            )
        case .retrying:
            localized(
                "ai_tasks_claude_state_retrying",
                en: "Claude will try again shortly",
                de: "Claude versucht es gleich erneut"
            )
        case .proposed:
            localized(
                "ai_tasks_claude_state_proposed",
                en: "Suggestion ready for review",
                de: "Vorschlag bereit zur Prüfung"
            )
        case .blocked:
            localized(
                "ai_tasks_claude_state_blocked",
                en: "Claude is unavailable, waiting",
                de: "Claude ist nicht verfügbar, wartet"
            )
        }
    }

    static var aiTasksProposalTitle: String {
        localized("ai_tasks_proposal_title", en: "Suggested entries", de: "Vorgeschlagene Einträge")
    }

    static var aiTasksProposalLog: String {
        localized("ai_tasks_proposal_log", en: "Log selected", de: "Auswahl eintragen")
    }

    static var aiTasksProposalDiscard: String {
        localized("ai_tasks_proposal_discard", en: "Discard", de: "Verwerfen")
    }

    static var aiTasksProposalNoneSelected: String {
        localized(
            "ai_tasks_proposal_none_selected",
            en: "Select at least one entry.",
            de: "Wähle mindestens einen Eintrag aus."
        )
    }

    static var aiTasksProposalLogged: String {
        localized("ai_tasks_proposal_logged", en: "Entries logged", de: "Einträge eingetragen")
    }

    static var aiTasksProposalAcceptConflict: String {
        localized(
            "ai_tasks_proposal_accept_conflict",
            en: "This suggestion is no longer available. The list has been refreshed.",
            de: "Dieser Vorschlag ist nicht mehr verfügbar. Die Liste wurde aktualisiert."
        )
    }

    static var aiTasksProposalAcceptFailed: String {
        localized(
            "ai_tasks_proposal_accept_failed",
            en: "The entries could not be logged. Check your connection and try again.",
            de: "Die Einträge konnten nicht eingetragen werden. Prüfe deine Verbindung und versuche es erneut."
        )
    }

    static var aiTasksCaptureHintClaude: String {
        localized(
            "ai_tasks_capture_hint_claude",
            en: "Claude processes this meal on the server and logs it for you.",
            de: "Claude verarbeitet diese Mahlzeit auf dem Server und trägt sie für dich ein."
        )
    }

    static var aiTasksCaptureHintClaudeReview: String {
        localized(
            "ai_tasks_capture_hint_claude_review",
            en: "Claude processes this meal on the server and suggests entries for you to review.",
            de: "Claude verarbeitet diese Mahlzeit auf dem Server und schlägt dir Einträge zur Prüfung vor."
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
