import Foundation

// Strings for the merge review sheet (`FoodMergeSheet`) and the Foods tab's
// multi-select merge, kept in their own file like the other feature strings.
extension L10n {
    static var foodMergeKeepSection: String {
        localized("food_merge_keep_section", en: "Food to keep", de: "Zu behaltendes Lebensmittel")
    }

    static var foodMergeKeepFooter: String {
        localized(
            "food_merge_keep_footer",
            en: "The food you keep stays. The others are deleted, and their diary entries, recipes and " +
                "supplements move over to it.",
            de: "Das behaltene Lebensmittel bleibt bestehen. Die anderen werden gelöscht, und ihre " +
                "Tagebucheinträge, Rezepte und Supplements werden darauf umgestellt."
        )
    }

    static var foodMergeKeepBadge: String {
        localized("food_merge_keep_badge", en: "Keep", de: "Behalten")
    }

    static var foodMergeRemoveBadge: String {
        localized("food_merge_remove_badge", en: "Merged in", de: "Wird übernommen")
    }

    static var foodMergeModeSummary: String {
        localized("food_merge_mode_summary", en: "Summary", de: "Übersicht")
    }

    static var foodMergeModeDiff: String {
        localized("food_merge_mode_diff", en: "Diff", de: "Diff")
    }

    static func foodMergeDifferenceCount(_ count: Int) -> String {
        switch count {
        case 0: localized("food_merge_difference_count_zero", en: "No differences", de: "Keine Unterschiede")
        case 1: localized("food_merge_difference_count_one", en: "1 field differs", de: "1 Feld unterscheidet sich")
        default:
            localized(
                "food_merge_difference_count_other",
                en: "\(count) fields differ",
                de: "\(count) Felder unterscheiden sich"
            )
        }
    }

    static var foodMergeIdentical: String {
        localized(
            "food_merge_identical",
            en: "These foods hold the same values. Merging only moves their diary entries, recipes and " +
                "supplements to the food you keep.",
            de: "Diese Lebensmittel haben dieselben Werte. Beim Zusammenführen werden nur Tagebucheinträge, " +
                "Rezepte und Supplements auf das behaltene Lebensmittel umgestellt."
        )
    }

    static var foodMergeKeyDifferences: String {
        localized("food_merge_key_differences", en: "Key differences", de: "Wichtigste Unterschiede")
    }

    static var foodMergeAllDifferences: String {
        localized("food_merge_all_differences", en: "All differences", de: "Alle Unterschiede")
    }

    static var foodMergeNoKeyDifferences: String {
        localized(
            "food_merge_no_key_differences",
            en: "Calories, macros, serving and barcode match.",
            de: "Kalorien, Makros, Portion und Barcode stimmen überein."
        )
    }

    static func foodMergeShowAll(_ count: Int) -> String {
        localized(
            "food_merge_show_all",
            en: "Show all \(count) differences",
            de: "Alle \(count) Unterschiede anzeigen"
        )
    }

    static var foodMergeShowKeyOnly: String {
        localized("food_merge_show_key_only", en: "Show key differences only", de: "Nur wichtigste Unterschiede")
    }

    static func foodMergeFilledFrom(_ food: String) -> String {
        localized("food_merge_filled_from", en: "Filled in from \(food)", de: "Ergänzt aus \(food)")
    }

    static func foodMergeTakenFrom(_ food: String) -> String {
        localized("food_merge_taken_from", en: "Taken from \(food)", de: "Übernommen aus \(food)")
    }

    static var foodMergeDiffFooter: String {
        localized(
            "food_merge_diff_footer",
            en: "+ is what the merged food gets, − is dropped. Tap a dropped value to use it instead.",
            de: "+ übernimmt das zusammengeführte Lebensmittel, − fällt weg. Tippe auf einen weggefallenen " +
                "Wert, um ihn stattdessen zu verwenden."
        )
    }

    static var foodMergeServingRescaled: String {
        localized(
            "food_merge_serving_rescaled",
            en: "Serving sizes differ. Pick the serving to keep; nutrient values from the other food are " +
                "rescaled to it, and moved diary entries are rescaled so their logged calories stay the same.",
            de: "Die Portionsgrössen unterscheiden sich. Wähle die Portion, die bleibt; Nährwerte des anderen " +
                "Lebensmittels werden darauf umgerechnet, und umgestellte Tagebucheinträge werden angepasst, " +
                "damit ihre Kalorien gleich bleiben."
        )
    }

    static var foodMergeServingUnitsConvert: String {
        localized(
            "food_merge_serving_units_convert",
            en: "Serving units differ but convert. Pick the serving to keep; nutrient values from the other " +
                "food are converted to it.",
            de: "Die Portionseinheiten unterscheiden sich, lassen sich aber umrechnen. Wähle die Portion, die " +
                "bleibt; Nährwerte des anderen Lebensmittels werden darauf umgerechnet."
        )
    }

    static var foodMergeServingIncompatible: String {
        localized(
            "food_merge_serving_incompatible",
            en: "Some serving units can't be converted into each other, like g and ml. Nutrients of " +
                "those foods can't be taken over; they stay with the food whose serving is kept.",
            de: "Manche Portionseinheiten lassen sich nicht ineinander umrechnen, etwa g und ml. Nährwerte " +
                "dieser Lebensmittel können nicht übernommen werden; sie bleiben beim Lebensmittel, dessen " +
                "Portion bleibt."
        )
    }

    static func foodMergeScaledFrom(_ serving: String) -> String {
        localized("food_merge_scaled_from", en: "scaled from \(serving)", de: "umgerechnet von \(serving)")
    }

    static var foodMergeServingUnit: String {
        localized("food_merge_serving_unit", en: "Serving unit", de: "Portionseinheit")
    }

    static var foodMergePhoto: String {
        localized("food_merge_photo", en: "Photo", de: "Foto")
    }

    static var foodMergeYes: String {
        localized("food_merge_yes", en: "Yes", de: "Ja")
    }

    static var foodMergeNo: String {
        localized("food_merge_no", en: "No", de: "Nein")
    }

    static var foodMergeLoadFailed: String {
        localized(
            "food_merge_load_failed",
            en: "Could not load these foods. Check your connection and try again.",
            de: "Diese Lebensmittel konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut."
        )
    }

    static var foodsSelect: String {
        localized("foods_select", en: "Select", de: "Auswählen")
    }

    static func foodsMergeSelected(_ count: Int) -> String {
        localized(
            "foods_merge_selected",
            en: "Merge \(count) foods",
            de: "\(count) Lebensmittel zusammenführen"
        )
    }

    static var foodsSelectToMerge: String {
        localized(
            "foods_select_to_merge",
            en: "Select two or more foods to merge",
            de: "Wähle zwei oder mehr Lebensmittel zum Zusammenführen"
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
