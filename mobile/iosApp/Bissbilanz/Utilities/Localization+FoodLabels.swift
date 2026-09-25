import Foundation

// New strings for the collapsible "Advanced" section (`FoodEditSheet`) and the
// on-device/Private Cloud Compute auto-labelling feature (`FoodLabeler.swift`,
// `FoodAutoLabeler.swift`, `LabelUnlabeledFoodsView.swift`), kept in their own
// file rather than appended to `Localization.swift` for the same reason
// `Localization+PrivateCloudCompute.swift` is: avoiding merge conflicts with
// other features landing in that shared file at the same time. Same
// `localized` pattern, private to this file.
extension L10n {
    static var advanced: String {
        localized("advanced", en: "Advanced", de: "Erweitert")
    }

    static func labelCount(_ count: Int) -> String {
        localized(
            "label_count",
            en: count == 1 ? "1 label" : "\(count) labels",
            de: count == 1 ? "1 Label" : "\(count) Labels"
        )
    }

    static func nutrientCount(_ count: Int) -> String {
        localized(
            "nutrient_count",
            en: count == 1 ? "1 nutrient" : "\(count) nutrients",
            de: count == 1 ? "1 Nährstoff" : "\(count) Nährstoffe"
        )
    }

    static var suggestLabels: String {
        localized("suggest_labels", en: "Suggest Labels", de: "Labels vorschlagen")
    }

    static var suggestingLabels: String {
        localized("suggesting_labels", en: "Suggesting…", de: "Wird vorgeschlagen…")
    }

    static var foodLabelUnavailable: String {
        localized(
            "food_label_unavailable",
            en: "Label suggestions aren't available on this device right now.",
            de: "Label-Vorschläge sind auf diesem Gerät derzeit nicht verfügbar."
        )
    }

    static var foodLabelGenerationError: String {
        localized(
            "food_label_generation_error",
            en: "Couldn't suggest labels.",
            de: "Labels konnten nicht vorgeschlagen werden."
        )
    }

    static var foodLabelsSectionTitle: String {
        localized("food_labels_section_title", en: "Food Labels", de: "Lebensmittel-Labels")
    }

    static var autoLabelToggleLabel: String {
        localized(
            "auto_label_toggle_label",
            en: "Auto-label new foods",
            de: "Neue Lebensmittel automatisch labeln"
        )
    }

    static var autoLabelToggleFooter: String {
        localized(
            "auto_label_toggle_footer",
            en: "When a new food has no labels yet, Bissbilanz can suggest some automatically using " +
                "on-device Apple Intelligence or, as a fallback, Private Cloud Compute. Skipped while an " +
                "AI assistant (MCP) is connected, since it labels with larger models.",
            de: "Wenn ein neues Lebensmittel noch keine Labels hat, kann Bissbilanz automatisch welche " +
                "vorschlagen – mit Apple Intelligence auf dem Gerät oder, als Ausweichoption, mit Private " +
                "Cloud Compute. Wird übersprungen, solange ein KI-Assistent (MCP) verbunden ist, da dieser " +
                "mit größeren Modellen labelt."
        )
    }

    static var labelUnlabeledFoods: String {
        localized("label_unlabeled_foods", en: "Label Unlabeled Foods", de: "Unbeschriftete Lebensmittel labeln")
    }

    static func unlabeledFoodCount(_ count: Int) -> String {
        localized(
            "unlabeled_food_count",
            en: count == 1 ? "1 food" : "\(count) foods",
            de: count == 1 ? "1 Lebensmittel" : "\(count) Lebensmittel"
        )
    }

    static func foodLabelSweepProgress(_ done: Int, _ total: Int) -> String {
        localized("food_label_sweep_progress", en: "\(done) of \(total)", de: "\(done) von \(total)")
    }

    static func foodLabelSweepSummary(labelled: Int, failed: Int) -> String {
        localized(
            "food_label_sweep_summary",
            en: failed == 0
                ? "Labelled \(labelled) foods."
                : "Labelled \(labelled) foods, \(failed) failed.",
            de: failed == 0
                ? "\(labelled) Lebensmittel beschriftet."
                : "\(labelled) Lebensmittel beschriftet, \(failed) fehlgeschlagen."
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
