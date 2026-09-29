import Foundation

// Strings for opening food packages from other apps, the on-device export and
// import, and the "new foods" section of the import review.
extension L10n {
    static var foodPackageNotAPackage: String {
        localized(
            "food_package_not_a_package",
            en: "This file isn’t a Bissbilanz food package.",
            de: "Diese Datei ist kein Bissbilanz-Lebensmittelpaket."
        )
    }

    static var foodPackageAccountExport: String {
        localized(
            "food_package_account_export",
            en: "This is a full account export, not a food package. Import it on the web under Settings → Import data.",
            de: "Das ist ein vollständiger Konto-Export, kein Lebensmittelpaket. Importiere ihn im Web unter Einstellungen → Daten importieren."
        )
    }

    static var foodPackageNewerVersion: String {
        localized(
            "food_package_newer_version",
            en: "This package was made by a newer version of Bissbilanz. Please update the app first.",
            de: "Dieses Paket wurde mit einer neueren Version von Bissbilanz erstellt. Bitte aktualisiere zuerst die App."
        )
    }

    static var foodPackageDamaged: String {
        localized(
            "food_package_damaged",
            en: "The file is damaged and can’t be read.",
            de: "Die Datei ist beschädigt und kann nicht gelesen werden."
        )
    }

    static var foodPackageEmptyFile: String {
        localized("food_package_empty_file", en: "The file is empty.", de: "Die Datei ist leer.")
    }

    static var foodPackageTooManyFiles: String {
        localized(
            "food_package_too_many_files",
            en: "The package contains too many files.",
            de: "Das Paket enthält zu viele Dateien."
        )
    }

    static var foodPackageTooManyItems: String {
        localized(
            "food_package_too_many_items",
            en: "Too many foods or recipes for one package — narrow the selection.",
            de: "Zu viele Lebensmittel oder Rezepte für ein Paket — schränke die Auswahl ein."
        )
    }

    static var foodPackageOpenFailed: String {
        localized(
            "food_package_open_failed",
            en: "The file couldn’t be opened.",
            de: "Die Datei konnte nicht geöffnet werden."
        )
    }

    static func foodPackageInvalid(_ detail: String) -> String {
        localized(
            "food_package_invalid",
            en: "The package is invalid: \(detail)",
            de: "Das Paket ist ungültig: \(detail)"
        )
    }

    // MARK: New foods

    static func foodPackageNewFoodsHeader(_ count: Int) -> String {
        switch count {
        case 0:
            localized(
                "food_package_new_foods_none",
                en: "No new foods will be added",
                de: "Es werden keine neuen Lebensmittel hinzugefügt"
            )
        case 1:
            localized(
                "food_package_new_foods_one",
                en: "1 new food will be added",
                de: "1 neues Lebensmittel wird hinzugefügt"
            )
        default:
            localized(
                "food_package_new_foods_many",
                en: "\(count) new foods will be added",
                de: "\(count) neue Lebensmittel werden hinzugefügt"
            )
        }
    }

    static var foodPackageNewFoodsFooter: String {
        localized(
            "food_package_new_foods_footer",
            en: "Already have one of these under another name? Use your own food instead of adding a duplicate.",
            de: "Hast du eines davon schon unter einem anderen Namen? Nutze dein eigenes Lebensmittel, statt ein Duplikat hinzuzufügen."
        )
    }

    static var foodPackageUseMyFood: String {
        localized("food_package_use_my_food", en: "Use one of my foods", de: "Eigenes Lebensmittel verwenden")
    }

    static var foodPackageUndoMapping: String {
        localized("food_package_undo_mapping", en: "Undo", de: "Rückgängig")
    }

    static var foodPackageIngredientBadge: String {
        localized("food_package_ingredient_badge", en: "Ingredient", de: "Zutat")
    }

    static func foodPackageWillUse(_ name: String) -> String {
        localized(
            "food_package_will_use",
            en: "Will use your “\(name)”",
            de: "Verwendet dein Lebensmittel „\(name)“"
        )
    }

    static func foodPackageUsedIn(_ names: String) -> String {
        localized("food_package_used_in", en: "Used in \(names)", de: "Verwendet in \(names)")
    }

    static func foodPackageUseMyFoodHint(_ name: String) -> String {
        localized(
            "food_package_use_my_food_hint",
            en: "Choose one of your foods to use instead of \(name)",
            de: "Eigenes Lebensmittel statt \(name) wählen"
        )
    }

    static func foodPackageUndoMappingHint(_ name: String) -> String {
        localized(
            "food_package_undo_mapping_hint",
            en: "Add \(name) as a new food again",
            de: "\(name) wieder als neues Lebensmittel hinzufügen"
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
