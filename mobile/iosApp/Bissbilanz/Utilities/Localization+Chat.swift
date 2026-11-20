import Foundation

// Strings for the assistant chat (conversation list, conversation screen,
// composer, confirmation cards, run and error notices, the privacy notice).
// Kept in their own file to avoid merge conflicts in the shared
// Localization.swift; same `localized` helper, re-declared privately.
extension L10n {
    // MARK: - Screens

    static var chatTabLabel: String {
        localized("chat_tab_label", en: "Chat", de: "Chat")
    }

    static var chatListTitle: String {
        localized("chat_list_title", en: "Chats", de: "Chats")
    }

    static var chatNewChat: String {
        localized("chat_new_chat", en: "New chat", de: "Neuer Chat")
    }

    static var chatOpenAssistant: String {
        localized("chat_open_assistant", en: "Ask the assistant", de: "Assistenten fragen")
    }

    static var chatSignInRequired: String {
        localized(
            "chat_sign_in_required",
            en: "Sign in to chat with the assistant about your diary.",
            de: "Melde dich an, um mit dem Assistenten über dein Tagebuch zu chatten."
        )
    }

    static var chatEmptyListTitle: String {
        localized("chat_empty_list_title", en: "No chats yet", de: "Noch keine Chats")
    }

    static var chatEmptyListMessage: String {
        localized(
            "chat_empty_list_message",
            en: "Ask the assistant about your diary, or have it log a meal for you.",
            de: "Frag den Assistenten zu deinem Tagebuch oder lass ihn eine Mahlzeit für dich eintragen."
        )
    }

    static var chatStartChat: String {
        localized("chat_start_chat", en: "Start a chat", de: "Chat starten")
    }

    static var chatWorking: String {
        localized("chat_working", en: "Working…", de: "Arbeitet …")
    }

    static var chatWaitingForYou: String {
        localized("chat_waiting_for_you", en: "Waiting for your confirmation", de: "Wartet auf deine Bestätigung")
    }

    static var chatRename: String {
        localized("chat_rename", en: "Rename", de: "Umbenennen")
    }

    static var chatRenameTitle: String {
        localized("chat_rename_title", en: "Rename chat", de: "Chat umbenennen")
    }

    static var chatTitlePlaceholder: String {
        localized("chat_title_placeholder", en: "Title", de: "Titel")
    }

    static var chatDeleteTitle: String {
        localized("chat_delete_title", en: "Delete this chat?", de: "Diesen Chat löschen?")
    }

    static var chatDeleteMessage: String {
        localized(
            "chat_delete_message",
            en: "Its messages and photos are removed. Changes the assistant made to your diary stay.",
            de: "Nachrichten und Fotos werden entfernt. Änderungen des Assistenten an deinem Tagebuch bleiben."
        )
    }

    static var chatMoreActions: String {
        localized("chat_more_actions", en: "More", de: "Mehr")
    }

    static var chatAbout: String {
        localized("chat_about", en: "About this chat", de: "Über diesen Chat")
    }

    // MARK: - Conversation

    static var chatEmptyTitle: String {
        localized("chat_empty_title", en: "How can I help?", de: "Wie kann ich helfen?")
    }

    static var chatEmptyMessage: String {
        localized(
            "chat_empty_message",
            en: "I can look at your diary and change it: entries, foods, recipes, goals, weight, sleep and "
                + "supplements.",
            de: "Ich kann dein Tagebuch ansehen und ändern: Einträge, Lebensmittel, Rezepte, Ziele, Gewicht, "
                + "Schlaf und Nahrungsergänzungen."
        )
    }

    static var chatSuggestionToday: String {
        localized(
            "chat_suggestion_today",
            en: "How does today look against my goals?",
            de: "Wie steht der heutige Tag im Vergleich zu meinen Zielen?"
        )
    }

    static var chatSuggestionRemaining: String {
        localized(
            "chat_suggestion_remaining",
            en: "What could I eat to hit my remaining macros?",
            de: "Was könnte ich essen, um meine restlichen Makros zu erreichen?"
        )
    }

    static var chatSuggestionLogMeal: String {
        localized("chat_suggestion_log_meal", en: "Log a meal I describe", de: "Eine beschriebene Mahlzeit eintragen")
    }

    static var chatSuggestionLogMealPrompt: String {
        localized("chat_suggestion_log_meal_prompt", en: "Log this meal for me: ", de: "Trag diese Mahlzeit für mich ein: ")
    }

    static var chatSuggestionWeekly: String {
        localized(
            "chat_suggestion_weekly",
            en: "How did my last week go?",
            de: "Wie lief meine letzte Woche?"
        )
    }

    static var chatYou: String {
        localized("chat_you", en: "You", de: "Du")
    }

    static var chatAssistant: String {
        localized("chat_assistant", en: "Assistant", de: "Assistent")
    }

    static var chatThinking: String {
        localized("chat_thinking", en: "Thinking…", de: "Denkt nach …")
    }

    static var chatQueued: String {
        localized("chat_queued", en: "Waiting to start…", de: "Wartet auf den Start …")
    }

    static var chatReconnecting: String {
        localized("chat_reconnecting", en: "Reconnecting…", de: "Verbindet erneut …")
    }

    static var chatSending: String {
        localized("chat_sending", en: "Sending…", de: "Wird gesendet …")
    }

    static var chatNotSent: String {
        localized("chat_not_sent", en: "Not sent", de: "Nicht gesendet")
    }

    static var chatCopy: String {
        localized("chat_copy", en: "Copy", de: "Kopieren")
    }

    static var chatToolRunning: String {
        localized("chat_tool_running", en: "In progress", de: "Läuft")
    }

    static var chatToolDone: String {
        localized("chat_tool_done", en: "Done", de: "Erledigt")
    }

    static var chatToolFailed: String {
        localized("chat_tool_failed", en: "Failed", de: "Fehlgeschlagen")
    }

    static func chatPhoto(_ number: Int) -> String {
        localized("chat_photo", en: "Photo \(number)", de: "Foto \(number)")
    }

    // MARK: - Composer

    static var chatComposerPlaceholder: String {
        localized("chat_composer_placeholder", en: "Message", de: "Nachricht")
    }

    static var chatSend: String {
        localized("chat_send", en: "Send", de: "Senden")
    }

    static var chatStop: String {
        localized("chat_stop", en: "Stop the answer", de: "Antwort stoppen")
    }

    static var chatStopping: String {
        localized("chat_stopping", en: "Stopping…", de: "Wird gestoppt …")
    }

    static var chatAttachPhoto: String {
        localized("chat_attach_photo", en: "Attach photo", de: "Foto anhängen")
    }

    static func chatPhotoLimit(_ count: Int) -> String {
        localized(
            "chat_photo_limit",
            en: "Up to \(count) photos per message.",
            de: "Bis zu \(count) Fotos pro Nachricht."
        )
    }

    static var chatConversationPhotosFull: String {
        localized(
            "chat_conversation_photos_full",
            en: "This chat holds no more photos. Start a new chat to send more.",
            de: "Dieser Chat fasst keine weiteren Fotos. Starte einen neuen Chat, um mehr zu senden."
        )
    }

    static func chatTextTooLong(_ max: Int) -> String {
        localized(
            "chat_text_too_long",
            en: "A message can be up to \(max) characters.",
            de: "Eine Nachricht kann bis zu \(max) Zeichen lang sein."
        )
    }

    static var chatComposerDisabled: String {
        localized(
            "chat_composer_disabled",
            en: "You can still read your chats.",
            de: "Deine Chats kannst du weiterhin lesen."
        )
    }

    // MARK: - Confirmations

    static var chatActionNeedsConfirmation: String {
        localized("chat_action_needs_confirmation", en: "Needs your confirmation", de: "Braucht deine Bestätigung")
    }

    static var chatApprove: String {
        localized("chat_approve", en: "Approve", de: "Bestätigen")
    }

    static var chatReject: String {
        localized("chat_reject", en: "Reject", de: "Ablehnen")
    }

    static var chatActionApproved: String {
        localized("chat_action_approved", en: "Approved", de: "Bestätigt")
    }

    static var chatActionRejected: String {
        localized("chat_action_rejected", en: "Rejected", de: "Abgelehnt")
    }

    static var chatActionExpired: String {
        localized("chat_action_expired", en: "Expired", de: "Abgelaufen")
    }

    static var chatActionCancelled: String {
        localized("chat_action_cancelled", en: "Cancelled", de: "Abgebrochen")
    }

    static var chatActionResolved: String {
        localized("chat_action_resolved", en: "Closed", de: "Geschlossen")
    }

    static func chatActionExpires(_ time: String) -> String {
        localized("chat_action_expires", en: "Open until \(time)", de: "Offen bis \(time)")
    }

    // MARK: - Notices

    static func chatNotice(_ notice: ChatNotice) -> String {
        switch notice {
        case .cutOff, .iterationLimit, .incomplete, .interrupted, .stopped:
            chatEndNotice(notice)
        case .unavailable, .noAccess, .budgetExhausted, .refusal, .conversationTooLong:
            chatBlockedNotice(notice)
        case .actionExpired, .actionNotPending, .runActive, .invalidImage, .conversationMissing:
            chatStateNotice(notice)
        case .dailyLimit, .rateLimited, .offline, .signedOut, .failed, .server:
            chatRequestNotice(notice)
        }
    }

    private static func chatEndNotice(_ notice: ChatNotice) -> String {
        switch notice {
        case .cutOff:
            localized("chat_notice_cut_off", en: "The answer was cut off.", de: "Die Antwort wurde abgeschnitten.")
        case .iterationLimit:
            localized(
                "chat_notice_iteration_limit",
                en: "The assistant stopped after many steps.",
                de: "Der Assistent hat nach vielen Schritten aufgehört."
            )
        case .interrupted:
            localized(
                "chat_notice_interrupted",
                en: "The answer was interrupted.",
                de: "Die Antwort wurde unterbrochen."
            )
        case .stopped:
            localized("chat_notice_stopped", en: "Stopped.", de: "Gestoppt.")
        default:
            localized(
                "chat_notice_incomplete",
                en: "The answer may be incomplete.",
                de: "Die Antwort ist eventuell unvollständig."
            )
        }
    }

    private static func chatBlockedNotice(_ notice: ChatNotice) -> String {
        switch notice {
        case .noAccess:
            localized(
                "chat_notice_no_access",
                en: "The assistant chat is not enabled for your account.",
                de: "Der Assistenten-Chat ist für dein Konto nicht freigeschaltet."
            )
        case .budgetExhausted:
            localized(
                "chat_notice_budget",
                en: "This month's assistant budget is used up.",
                de: "Das Assistenten-Budget für diesen Monat ist aufgebraucht."
            )
        case .refusal:
            localized(
                "chat_notice_refusal",
                en: "The assistant declined this request.",
                de: "Der Assistent hat diese Anfrage abgelehnt."
            )
        case .conversationTooLong:
            localized(
                "chat_notice_too_long",
                en: "This chat is full. Start a new one.",
                de: "Dieser Chat ist voll. Starte einen neuen."
            )
        default:
            localized(
                "chat_notice_unavailable",
                en: "The assistant is not available right now.",
                de: "Der Assistent ist gerade nicht verfügbar."
            )
        }
    }

    private static func chatStateNotice(_ notice: ChatNotice) -> String {
        switch notice {
        case .actionExpired:
            localized("chat_notice_action_expired", en: "The confirmation expired.", de: "Die Bestätigung ist abgelaufen.")
        case .actionNotPending:
            localized(
                "chat_notice_action_not_pending",
                en: "This confirmation is no longer open.",
                de: "Diese Bestätigung ist nicht mehr offen."
            )
        case .runActive:
            localized(
                "chat_notice_run_active",
                en: "The assistant is still answering. Wait for it or stop it.",
                de: "Der Assistent antwortet noch. Warte oder stoppe ihn."
            )
        case .invalidImage:
            localized(
                "chat_notice_invalid_image",
                en: "A photo could not be sent. Remove it and try again.",
                de: "Ein Foto konnte nicht gesendet werden. Entferne es und versuch es noch einmal."
            )
        default:
            localized("chat_notice_missing", en: "This chat no longer exists.", de: "Diesen Chat gibt es nicht mehr.")
        }
    }

    private static func chatRequestNotice(_ notice: ChatNotice) -> String {
        switch notice {
        case let .dailyLimit(retryAfter):
            chatDailyLimit(retryAfter: retryAfter)
        case .rateLimited:
            localized(
                "chat_notice_rate_limited",
                en: "Too many requests. Try again in a moment.",
                de: "Zu viele Anfragen. Versuch es gleich noch einmal."
            )
        case .offline:
            localized(
                "chat_notice_offline",
                en: "No connection. Check your network and try again.",
                de: "Keine Verbindung. Prüfe dein Netzwerk und versuch es noch einmal."
            )
        case .signedOut:
            localized(
                "chat_notice_signed_out",
                en: "Your session expired. Sign in again to chat.",
                de: "Deine Sitzung ist abgelaufen. Melde dich erneut an, um zu chatten."
            )
        case let .server(message):
            message
        default:
            localized(
                "chat_notice_failed",
                en: "Something went wrong. Try again.",
                de: "Etwas ist schiefgelaufen. Versuch es noch einmal."
            )
        }
    }

    private static func chatDailyLimit(retryAfter: TimeInterval?) -> String {
        guard let retryAfter else {
            return localized(
                "chat_notice_daily_limit",
                en: "You've reached today's message limit. Try again later.",
                de: "Du hast das heutige Nachrichtenlimit erreicht. Versuch es später noch einmal."
            )
        }
        let when = Date().addingTimeInterval(retryAfter).formatted(
            Date.RelativeFormatStyle(presentation: .named, unitsStyle: .wide)
                .locale(Locale(identifier: currentLocale.rawValue))
        )
        return localized(
            "chat_notice_daily_limit_retry",
            en: "You've reached today's message limit. Try again \(when).",
            de: "Du hast das heutige Nachrichtenlimit erreicht. Versuch es \(when) wieder."
        )
    }

    // MARK: - Privacy

    static var chatPrivacyTitle: String {
        localized("chat_privacy_title", en: "About the assistant chat", de: "Über den Assistenten-Chat")
    }

    static var chatPrivacyBody: String {
        localized(
            "chat_privacy_body",
            en: "Your messages, the photos you attach and the diary data the assistant looks up to answer are sent "
                + "to Anthropic to be processed by Claude. Chats stay until you delete them.",
            de: "Deine Nachrichten, angehängte Fotos und die Tagebuchdaten, die der Assistent für eine Antwort "
                + "abruft, werden zur Verarbeitung durch Claude an Anthropic gesendet. Chats bleiben gespeichert, "
                + "bis du sie löschst."
        )
    }

    static var chatPrivacyChanges: String {
        localized(
            "chat_privacy_changes",
            en: "The assistant can change your diary. Before deleting anything it asks you first.",
            de: "Der Assistent kann dein Tagebuch ändern. Bevor er etwas löscht, fragt er dich."
        )
    }

    static var chatPrivacyAcknowledge: String {
        localized("chat_privacy_acknowledge", en: "Got it", de: "Verstanden")
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
