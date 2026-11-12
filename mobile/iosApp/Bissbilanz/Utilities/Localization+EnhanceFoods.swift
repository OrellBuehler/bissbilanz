import Foundation

// Strings for "Enhance Foods" (`EnhanceFoodsView`) and the single-food lookup
// on the food detail screen, kept in their own file rather than appended to
// `Localization.swift` for the same reason `Localization+FoodLabels.swift` is:
// avoiding merge conflicts with other features landing in that shared file at
// the same time.
extension L10n {
    static var enhanceFoods: String {
        localized("enhance_foods", en: "Enhance Foods", de: "Lebensmittel anreichern")
    }

    static var enhanceFoodsFooter: String {
        localized(
            "enhance_foods_footer",
            en: "Loads Nutri-Score, NOVA group and nutrition label details from Open Food Facts for foods with a barcode.",
            de: "Lädt Nutri-Score, NOVA-Gruppe und Nährwertangaben von Open Food Facts für Lebensmittel mit Barcode."
        )
    }

    static var enhanceFoodsExplanation: String {
        localized(
            "enhance_foods_explanation",
            en: "Looks up your foods with a barcode on Open Food Facts. The Nutri-Score and NOVA group are replaced by the Open Food Facts values; ingredients, additives, detailed nutrients and a photo are only filled in where missing. Names, servings, calories and macros stay as they are. Foods checked in the last 30 days are skipped.",
            de: "Sucht deine Lebensmittel mit Barcode bei Open Food Facts. Nutri-Score und NOVA-Gruppe werden durch die Werte von Open Food Facts ersetzt; Zutaten, Zusatzstoffe, detaillierte Nährwerte und ein Foto werden nur ergänzt, wo sie fehlen. Namen, Portionen, Kalorien und Makros bleiben unverändert. Lebensmittel, die in den letzten 30 Tagen geprüft wurden, werden übersprungen."
        )
    }

    static func enhanceFoodsProgress(_ done: Int, _ total: Int) -> String {
        localized(
            "enhance_foods_progress",
            en: "Checked \(done) of \(total)",
            de: "\(done) von \(total) geprüft"
        )
    }

    static var enhanceFoodsWaiting: String {
        localized(
            "enhance_foods_waiting",
            en: "Open Food Facts is busy, retrying shortly…",
            de: "Open Food Facts ist ausgelastet, gleich neuer Versuch…"
        )
    }

    static func enhanceFoodsCandidates(_ count: Int) -> String {
        localized(
            "enhance_foods_candidates",
            en: "Foods to check: \(count)",
            de: "Zu prüfende Lebensmittel: \(count)"
        )
    }

    static var enhanceFoodsNone: String {
        localized(
            "enhance_foods_none",
            en: "All foods with a barcode have been checked.",
            de: "Alle Lebensmittel mit Barcode wurden geprüft."
        )
    }

    static var enhanceFoodsStart: String {
        localized("enhance_foods_start", en: "Start", de: "Starten")
    }

    static var enhanceFoodsStop: String {
        localized("enhance_foods_stop", en: "Stop", de: "Stoppen")
    }

    static var enhanceFoodsQueued: String {
        localized("enhance_foods_queued", en: "Starting…", de: "Wird gestartet…")
    }

    static func enhanceFoodsJobProgress(_ job: FoodEnrichmentJob) -> String {
        job.phase == .queued ? enhanceFoodsQueued : enhanceFoodsProgress(job.processed, job.total)
    }

    static func enhanceFoodsCounts(updated: Int, notFound: Int, failed: Int) -> String {
        localized(
            "enhance_foods_counts",
            en: "\(updated) enhanced · \(notFound) not found · \(failed) failed",
            de: "\(updated) angereichert · \(notFound) nicht gefunden · \(failed) fehlgeschlagen"
        )
    }

    static var enhanceFoodsServerNote: String {
        localized(
            "enhance_foods_server_note",
            en: "Runs on the server at about one food per second, so you can leave this screen or close the app.",
            de: "Läuft auf dem Server mit etwa einem Lebensmittel pro Sekunde, du kannst diesen Bildschirm also verlassen oder die App schließen."
        )
    }

    static var enhanceFoodsDeviceNote: String {
        localized(
            "enhance_foods_device_note",
            en: "Runs on this device while the app is open. You can leave this screen.",
            de: "Läuft auf diesem Gerät, solange die App geöffnet ist. Du kannst diesen Bildschirm verlassen."
        )
    }

    static func enhanceFoodsLastCompleted(date: String?, processed: Int) -> String {
        guard let date else {
            return localized(
                "enhance_foods_last_completed_undated",
                en: "Last run: checked \(processed)",
                de: "Letzter Lauf: \(processed) geprüft"
            )
        }
        return localized(
            "enhance_foods_last_completed",
            en: "Last run \(date): checked \(processed)",
            de: "Letzter Lauf \(date): \(processed) geprüft"
        )
    }

    static func enhanceFoodsLastCancelled(date: String?, processed: Int, total: Int) -> String {
        guard let date else {
            return localized(
                "enhance_foods_last_cancelled_undated",
                en: "Stopped after \(processed) of \(total)",
                de: "Gestoppt nach \(processed) von \(total)"
            )
        }
        return localized(
            "enhance_foods_last_cancelled",
            en: "Stopped \(date) after \(processed) of \(total)",
            de: "Gestoppt \(date) nach \(processed) von \(total)"
        )
    }

    static func enhanceFoodsLastFailed(date: String?, processed: Int, total: Int) -> String {
        guard let date else {
            return localized(
                "enhance_foods_last_failed_undated",
                en: "Stopped after \(processed) of \(total) because of repeated errors. Try again later.",
                de: "Abgebrochen nach \(processed) von \(total) wegen wiederholter Fehler. Versuche es später erneut."
            )
        }
        return localized(
            "enhance_foods_last_failed",
            en: "Stopped \(date) after \(processed) of \(total) because of repeated errors. Try again later.",
            de: "Abgebrochen \(date) nach \(processed) von \(total) wegen wiederholter Fehler. Versuche es später erneut."
        )
    }

    static func enhanceFoodsLastOffline(processed: Int, total: Int) -> String {
        localized(
            "enhance_foods_last_offline",
            en: "Stopped after \(processed) of \(total) because the connection was lost.",
            de: "Gestoppt nach \(processed) von \(total), weil die Verbindung verloren ging."
        )
    }

    static var enhanceFoodsLoadFailed: String {
        localized(
            "enhance_foods_load_failed",
            en: "Could not load the status.",
            de: "Der Status konnte nicht geladen werden."
        )
    }

    static var enhanceFoodsOffline: String {
        localized(
            "enhance_foods_offline",
            en: "Enhancing foods needs an internet connection.",
            de: "Zum Anreichern ist eine Internetverbindung nötig."
        )
    }

    static var enhanceFoodsActionFailed: String {
        localized(
            "enhance_foods_action_failed",
            en: "That did not work. Please try again.",
            de: "Das hat nicht geklappt. Bitte versuche es erneut."
        )
    }

    static func enhanceFoodsRateLimited(seconds: Int) -> String {
        localized(
            "enhance_foods_rate_limited",
            en: "Too many requests. Try again in \(seconds) s.",
            de: "Zu viele Anfragen. Versuche es in \(seconds) s erneut."
        )
    }

    static var enhanceFoodsRefreshFailed: String {
        localized(
            "enhance_foods_refresh_failed",
            en: "The enhanced foods will appear on this device after the next sync.",
            de: "Die angereicherten Lebensmittel erscheinen nach der nächsten Synchronisierung auf diesem Gerät."
        )
    }

    static func enhanceFoodsNotice(_ notice: FoodEnrichmentNotice) -> String {
        switch notice {
        case .offline: enhanceFoodsOffline
        case let .rateLimited(seconds): enhanceFoodsRateLimited(seconds: seconds)
        case .actionFailed: enhanceFoodsActionFailed
        case .foodsRefreshFailed: enhanceFoodsRefreshFailed
        }
    }

    static var enrichNothingNew: String {
        localized(
            "enrich_nothing_new",
            en: "Open Food Facts has nothing new for this food",
            de: "Open Food Facts hat nichts Neues für dieses Lebensmittel"
        )
    }

    static var enrichProductNotFound: String {
        localized(
            "enrich_product_not_found",
            en: "Product not found in Open Food Facts",
            de: "Produkt nicht bei Open Food Facts gefunden"
        )
    }

    static var enrichPendingChanges: String {
        localized(
            "enrich_pending_changes",
            en: "Your latest changes to this food are still syncing. Try again in a moment.",
            de: "Deine letzten Änderungen an diesem Lebensmittel werden noch synchronisiert. Versuche es gleich noch einmal."
        )
    }

    static var enrichNoBarcode: String {
        localized(
            "enrich_no_barcode",
            en: "This food has no barcode to look up.",
            de: "Dieses Lebensmittel hat keinen Barcode zum Nachschlagen."
        )
    }

    static var enrichFoodGone: String {
        localized(
            "enrich_food_gone",
            en: "This food no longer exists.",
            de: "Dieses Lebensmittel gibt es nicht mehr."
        )
    }

    static var enrichFoodChanged: String {
        localized(
            "enrich_food_changed",
            en: "The food changed during the lookup. Try again.",
            de: "Das Lebensmittel wurde während der Suche geändert. Versuche es erneut."
        )
    }

    static var enrichInvalidResponse: String {
        localized(
            "enrich_invalid_response",
            en: "Open Food Facts returned data that could not be read.",
            de: "Open Food Facts hat Daten geliefert, die nicht gelesen werden konnten."
        )
    }

    static var enrichUnavailable: String {
        localized(
            "enrich_unavailable",
            en: "Open Food Facts is not reachable right now. Try again later.",
            de: "Open Food Facts ist gerade nicht erreichbar. Versuche es später erneut."
        )
    }

    static func enrichFailureMessage(for error: Error) -> String {
        guard let failure = error as? FoodEnrichmentFailure else {
            switch ErrorReporter.reason(for: error) {
            case "offline", "timeout", "cannot_reach_host": return enhanceFoodsOffline
            default: return enrichFailed
            }
        }
        switch failure {
        case let .rateLimited(retryAfter):
            return enhanceFoodsRateLimited(seconds: FoodEnrichmentController.wholeSeconds(retryAfter))
        case .noBarcode: return enrichNoBarcode
        case .foodNotFound: return enrichFoodGone
        case .foodChanged: return enrichFoodChanged
        case .offInvalidResponse: return enrichInvalidResponse
        case .offUnavailable: return enrichUnavailable
        case .pendingChanges: return enrichPendingChanges
        case .failed: return enrichFailed
        }
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
