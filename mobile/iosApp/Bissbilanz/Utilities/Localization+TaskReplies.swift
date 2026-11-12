import Foundation

// Strings for replying to Claude on a task it processed on the server: the
// thread, the reply box, why a reply is not possible and the answer
// notification. Same keys as the web client where it has the string. Kept in
// their own file for the same merge-conflict reason as `Localization+Claude.swift`.
extension L10n {
    static var aiTasksReplyLabel: String {
        localized("ai_tasks_reply_label", en: "Reply to Claude", de: "Claude antworten")
    }

    static var aiTasksReplyPlaceholder: String {
        localized(
            "ai_tasks_reply_placeholder",
            en: "Something wrong? Tell Claude what to fix.",
            de: "Stimmt etwas nicht? Schreib Claude, was korrigiert werden soll."
        )
    }

    static var aiTasksReplyHint: String {
        localized(
            "ai_tasks_reply_hint",
            en: "Claude can change this meal's entries, and foods it created only for this meal.",
            de: "Claude kann die Einträge dieser Mahlzeit ändern und Lebensmittel, die nur für sie erstellt wurden."
        )
    }

    static func aiTasksRepliesRemaining(_ count: Int) -> String {
        if count == 1 {
            return localized("ai_tasks_replies_remaining_one", en: "1 reply left.", de: "Noch 1 Antwort möglich.")
        }
        return localized(
            "ai_tasks_replies_remaining",
            en: "\(count) replies left.",
            de: "Noch \(count) Antworten möglich."
        )
    }

    static var aiTasksReplySend: String {
        localized("ai_tasks_reply_send", en: "Send reply", de: "Antwort senden")
    }

    static var aiTasksReplyWorking: String {
        localized(
            "ai_tasks_reply_working",
            en: "Claude is working on your reply",
            de: "Claude bearbeitet deine Antwort"
        )
    }

    static var aiTasksReplyYou: String {
        localized("ai_tasks_reply_you", en: "You", de: "Du")
    }

    static var aiTasksReplyClaude: String {
        localized("ai_tasks_reply_claude", en: "Claude", de: "Claude")
    }

    static var aiTasksReplyChanged: String {
        localized("ai_tasks_reply_changed", en: "Changes applied", de: "Änderungen übernommen")
    }

    static var aiTasksReplyFailed: String {
        localized("ai_tasks_reply_failed", en: "Did not work", de: "Hat nicht geklappt")
    }

    static func aiTasksReplyBlocked(_ reason: AiTaskReplyBlockedReason) -> String {
        switch reason {
        case .replyLimitReached:
            localized(
                "ai_tasks_reply_blocked_limit",
                en: "This task has reached its reply limit.",
                de: "Für diese Aufgabe sind keine weiteren Antworten möglich."
            )
        case .failedTooOften:
            localized(
                "ai_tasks_reply_blocked_failing",
                en: "Claude could not handle the last replies on this meal. Try again tomorrow.",
                de: "Claude konnte die letzten Antworten zu dieser Mahlzeit nicht verarbeiten. " +
                    "Versuche es morgen erneut."
            )
        case .rateLimited:
            localized(
                "ai_tasks_reply_blocked_rate",
                en: "You have sent a lot of replies today. Try again later.",
                de: "Du hast heute schon viele Antworten gesendet. Versuche es später erneut."
            )
        case .processorUnavailable:
            localized(
                "ai_tasks_reply_blocked_unavailable",
                en: "Claude is not available for your account right now.",
                de: "Claude ist für dein Konto gerade nicht verfügbar."
            )
        case .budgetExhausted:
            localized(
                "ai_tasks_reply_blocked_budget",
                en: "Claude's monthly budget is used up.",
                de: "Das Monatsbudget für Claude ist aufgebraucht."
            )
        case .correctionInFlight:
            localized(
                "ai_tasks_reply_blocked_in_flight",
                en: "Claude is still working on your last reply.",
                de: "Claude bearbeitet noch deine letzte Antwort."
            )
        case .notCompleted:
            localized(
                "ai_tasks_reply_blocked_not_completed",
                en: "Replies are possible once this task is completed.",
                de: "Antworten sind möglich, sobald diese Aufgabe erledigt ist."
            )
        case .notProcessedByServer:
            localized(
                "ai_tasks_reply_blocked_not_server",
                en: "Only meals Claude processed on the server take replies.",
                de: "Antworten sind nur bei Mahlzeiten möglich, die Claude auf dem Server verarbeitet hat."
            )
        case .other:
            localized(
                "ai_tasks_reply_blocked_other",
                en: "Replies are not possible for this task right now.",
                de: "Antworten sind für diese Aufgabe gerade nicht möglich."
            )
        }
    }

    /// What the reply box says under the text it kept after a failed send.
    static func aiTasksReplyFailure(_ failure: AiTaskReplyFailure) -> String {
        switch failure {
        case .network:
            localized(
                "ai_tasks_reply_network_error",
                en: "Your reply could not be sent. Check your connection and try again.",
                de: "Deine Antwort konnte nicht gesendet werden. Prüfe deine Verbindung und versuche es erneut."
            )
        case .unauthorized:
            localized(
                "ai_tasks_reply_sign_in",
                en: "Sign in again to send replies.",
                de: "Melde dich erneut an, um Antworten zu senden."
            )
        case .taskNotFound:
            localized(
                "ai_tasks_reply_task_gone",
                en: "This task no longer exists.",
                de: "Diese Aufgabe gibt es nicht mehr."
            )
        case let .blocked(reason, _):
            aiTasksReplyBlocked(reason)
        case .tooManyRequests:
            localized(
                "ai_tasks_reply_too_many_requests",
                en: "Too many requests. Try again in a moment.",
                de: "Zu viele Anfragen. Versuche es gleich erneut."
            )
        case .requestInProgress:
            localized(
                "ai_tasks_reply_still_sending",
                en: "Your reply is still being sent. Check again in a moment.",
                de: "Deine Antwort wird noch gesendet. Schau gleich noch einmal nach."
            )
        case .updateRequired, .keyReused, .invalid, .rejected, .failed:
            localized(
                "ai_tasks_reply_error",
                en: "Your reply could not be sent.",
                de: "Deine Antwort konnte nicht gesendet werden."
            )
        }
    }

    static var aiTasksReplyNotificationTitle: String {
        localized("ai_tasks_reply_notification_title", en: "Claude replied", de: "Claude hat geantwortet")
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
