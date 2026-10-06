import Foundation

// Strings for importing a food package too big to review (tens of thousands of foods) and for
// the background upload of what it imported.
extension L10n {
    // MARK: Import

    static func bulkImportHeadline(_ foods: Int) -> String {
        localized(
            "bulk_import_headline",
            en: "\(foods.formatted()) foods",
            de: "\(foods.formatted()) Lebensmittel"
        )
    }

    static func bulkImportDetails(images: Int, sizeMB: Int) -> String {
        localized(
            "bulk_import_details",
            en: "\(images.formatted()) photos · \(sizeMB.formatted()) MB",
            de: "\(images.formatted()) Fotos · \(sizeMB.formatted()) MB"
        )
    }

    static var bulkImportNoPreview: String {
        localized(
            "bulk_import_no_preview",
            en: "This package is too big to review one food at a time. Foods you already have — the same name and brand, or the same barcode — are skipped; the rest are added right away.",
            de: "Dieses Paket ist zu gross, um jedes Lebensmittel einzeln zu prüfen. Lebensmittel, die du schon hast — gleicher Name und gleiche Marke oder gleicher Barcode —, werden übersprungen; alle anderen werden sofort hinzugefügt."
        )
    }

    static var bulkImportUploadNote: String {
        localized(
            "bulk_import_upload_note",
            en: "You can use them straight away. They are uploaded to your account in the background, over time.",
            de: "Du kannst sie sofort verwenden. Sie werden im Hintergrund nach und nach in dein Konto hochgeladen."
        )
    }

    static func bulkImportRecipesIgnored(_ count: Int) -> String {
        localized(
            "bulk_import_recipes_ignored",
            en: count == 1 ? "1 recipe in the package is not imported." : "\(count.formatted()) recipes in the package are not imported.",
            de: count == 1 ? "1 Rezept im Paket wird nicht importiert." : "\(count.formatted()) Rezepte im Paket werden nicht importiert."
        )
    }

    static func bulkImportButton(_ foods: Int) -> String {
        localized(
            "bulk_import_button",
            en: "Import \(foods.formatted()) foods",
            de: "\(foods.formatted()) Lebensmittel importieren"
        )
    }

    static func bulkImportProgress(done: Int, total: Int) -> String {
        localized(
            "bulk_import_progress",
            en: "Importing… \(done.formatted()) / \(total.formatted())",
            de: "Importiere… \(done.formatted()) / \(total.formatted())"
        )
    }

    static var bulkImportStop: String {
        localized("bulk_import_stop", en: "Stop", de: "Stoppen")
    }

    static var bulkImportStopped: String {
        localized(
            "bulk_import_stopped",
            en: "The import was stopped. Foods already added are kept; import the file again to continue where it left off.",
            de: "Der Import wurde gestoppt. Bereits hinzugefügte Lebensmittel bleiben erhalten; importiere die Datei erneut, um dort weiterzumachen."
        )
    }

    static var bulkImportDone: String {
        localized("bulk_import_done", en: "Import finished", de: "Import abgeschlossen")
    }

    static func bulkImportResult(created: Int, skipped: Int, invalid: Int) -> String {
        localized(
            "bulk_import_result",
            en: "\(created.formatted()) added, \(skipped.formatted()) already there, \(invalid.formatted()) invalid",
            de: "\(created.formatted()) hinzugefügt, \(skipped.formatted()) schon vorhanden, \(invalid.formatted()) ungültig"
        )
    }

    static func bulkImportPhotos(stored: Int, failed: Int) -> String {
        localized(
            "bulk_import_photos",
            en: failed == 0
                ? "\(stored.formatted()) photos saved"
                : "\(stored.formatted()) photos saved, \(failed.formatted()) could not be read",
            de: failed == 0
                ? "\(stored.formatted()) Fotos gespeichert"
                : "\(stored.formatted()) Fotos gespeichert, \(failed.formatted()) nicht lesbar"
        )
    }

    static var bulkImportNeedsSignIn: String {
        localized(
            "bulk_import_needs_sign_in",
            en: "Sign in again to import this package.",
            de: "Melde dich erneut an, um dieses Paket zu importieren."
        )
    }

    static var bulkImportCloudTitle: String {
        localized(
            "bulk_import_cloud_title",
            en: "Import into iCloud-synced data?",
            de: "In iCloud-synchronisierte Daten importieren?"
        )
    }

    static var bulkImportCloudMessage: String {
        localized(
            "bulk_import_cloud_message",
            en: "In Local mode your data is mirrored to iCloud. Tens of thousands of foods and photos can take a long time to sync to your other devices and use a lot of iCloud storage.",
            de: "Im lokalen Modus werden deine Daten in iCloud gespiegelt. Zehntausende Lebensmittel und Fotos können lange brauchen, bis sie auf deinen anderen Geräten ankommen, und viel iCloud-Speicher belegen."
        )
    }

    static var bulkImportCloudContinue: String {
        localized("bulk_import_cloud_continue", en: "Import anyway", de: "Trotzdem importieren")
    }

    // MARK: Upload banner

    static func bulkUploadBanner(done: Int, total: Int) -> String {
        localized(
            "bulk_upload_banner",
            en: "Syncing \(done.formatted()) / \(total.formatted()) foods",
            de: "Synchronisiere \(done.formatted()) / \(total.formatted()) Lebensmittel"
        )
    }

    static func bulkUploadFailed(_ count: Int) -> String {
        localized(
            "bulk_upload_failed",
            en: count == 1 ? "1 food could not be uploaded" : "\(count.formatted()) foods could not be uploaded",
            de: count == 1 ? "1 Lebensmittel konnte nicht hochgeladen werden" : "\(count.formatted()) Lebensmittel konnten nicht hochgeladen werden"
        )
    }

    static var bulkUploadPause: String {
        localized("bulk_upload_pause", en: "Pause", de: "Pausieren")
    }

    static var bulkUploadResume: String {
        localized("bulk_upload_resume", en: "Resume", de: "Fortsetzen")
    }

    static var bulkUploadWifiOnly: String {
        localized("bulk_upload_wifi_only", en: "Wi-Fi only", de: "Nur über WLAN")
    }

    static var bulkUploadRetryFailed: String {
        localized("bulk_upload_retry_failed", en: "Retry failed foods", de: "Fehlgeschlagene erneut versuchen")
    }

    static var bulkUploadOptions: String {
        localized("bulk_upload_options", en: "Upload options", de: "Upload-Optionen")
    }

    static var bulkUploadPaused: String {
        localized("bulk_upload_paused", en: "Paused", de: "Pausiert")
    }

    static var bulkUploadOffline: String {
        localized("bulk_upload_offline", en: "Waiting for a connection", de: "Warte auf eine Verbindung")
    }

    static var bulkUploadWaitingForWifi: String {
        localized("bulk_upload_waiting_wifi", en: "Waiting for Wi-Fi", de: "Warte auf WLAN")
    }

    static var bulkUploadRateLimited: String {
        localized(
            "bulk_upload_rate_limited",
            en: "Slowed down by the server, carrying on shortly",
            de: "Vom Server gebremst, geht gleich weiter"
        )
    }

    static func signOutBulkWarning(_ count: Int) -> String {
        localized(
            "sign_out_bulk_warning",
            en: count == 1
                ? "1 imported food has not been uploaded yet and will be lost."
                : "\(count.formatted()) imported foods have not been uploaded yet and will be lost.",
            de: count == 1
                ? "1 importiertes Lebensmittel wurde noch nicht hochgeladen und geht verloren."
                : "\(count.formatted()) importierte Lebensmittel wurden noch nicht hochgeladen und gehen verloren."
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
