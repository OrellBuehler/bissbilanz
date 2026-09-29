import Foundation

// Strings for `StoreUnavailableView`, the screen shown when the on-device
// database cannot be opened.
extension L10n {
    static var storeUnavailableTitle: String {
        localized(
            "store_unavailable_title",
            en: "Your data can't be opened",
            de: "Deine Daten lassen sich nicht öffnen"
        )
    }

    static var storeUnavailableMessage: String {
        localized(
            "store_unavailable_message",
            en: "Bissbilanz couldn't open the database on this device. Nothing has been deleted or " +
                "changed. Close the app and open it again. If this keeps happening, contact support " +
                "so your data can be recovered.",
            de: "Bissbilanz konnte die Datenbank auf diesem Gerät nicht öffnen. Es wurde nichts gelöscht " +
                "oder verändert. Schliesse die App und öffne sie erneut. Wenn das weiterhin passiert, " +
                "wende dich an den Support, damit deine Daten wiederhergestellt werden können."
        )
    }

    static var storeUnavailableBackupNote: String {
        localized(
            "store_unavailable_backup_note",
            en: "A copy of the database was saved next to the original.",
            de: "Eine Kopie der Datenbank wurde neben dem Original gespeichert."
        )
    }

    static var storeUnavailableSupport: String {
        localized("store_unavailable_support", en: "Contact support", de: "Support kontaktieren")
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
