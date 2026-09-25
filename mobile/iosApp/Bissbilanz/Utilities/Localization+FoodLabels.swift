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

    static var suggestLabelsHint: String {
        localized(
            "suggest_labels_hint",
            en: "Suggestions use the food's name, brand, serving unit and ingredients — and its photo too, " +
                "on iOS 27 or later, when the food has one. Adding a photo helps most for foods without a " +
                "descriptive name or ingredients list.",
            de: "Vorschläge basieren auf Name, Marke, Portionseinheit und Zutaten des Lebensmittels – ab " +
                "iOS 27 zusätzlich auf dem Foto, falls vorhanden. Ein Foto hilft besonders bei Lebensmitteln " +
                "ohne aussagekräftigen Namen oder Zutatenliste."
        )
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
            en: "When a new food has no labels yet, Bissbilanz suggests some automatically using the " +
                "labelling method chosen above.",
            de: "Wenn ein neues Lebensmittel noch keine Labels hat, schlägt Bissbilanz automatisch welche " +
                "vor – mit der oben gewählten Labelling-Methode."
        )
    }

    static var foodLabelProviderTitle: String {
        localized("food_label_provider_title", en: "Labelling Method", de: "Labelling-Methode")
    }

    static var foodLabelProviderAutomatic: String {
        localized("food_label_provider_automatic", en: "Automatic", de: "Automatisch")
    }

    static var foodLabelProviderOnDevice: String {
        localized("food_label_provider_on_device", en: "On-Device Only", de: "Nur auf dem Gerät")
    }

    static var foodLabelProviderPrivateCloud: String {
        localized(
            "food_label_provider_private_cloud",
            en: "Private Cloud Compute",
            de: "Private Cloud Compute"
        )
    }

    static var foodLabelProviderMcp: String {
        localized("food_label_provider_mcp", en: "AI Assistant (MCP)", de: "KI-Assistent (MCP)")
    }

    static var foodLabelProviderFooter: String {
        localized(
            "food_label_provider_footer",
            en: "Choose what suggests food labels — for new foods, \"Suggest Labels\" and the labelling " +
                "sweep below. Automatic tries on-device Apple Intelligence first and falls back to Private " +
                "Cloud Compute. On-Device Only and Private Cloud Compute each use just one of those, even " +
                "if the other would work. AI Assistant (MCP) leaves labelling entirely to a connected " +
                "assistant instead, and never runs it automatically.",
            de: "Wähle, was Lebensmittel-Labels vorschlägt – für neue Lebensmittel, „Labels vorschlagen“ " +
                "und den Labelling-Durchlauf unten. Automatisch versucht zuerst Apple Intelligence auf dem " +
                "Gerät und weicht bei Bedarf auf Private Cloud Compute aus. „Nur auf dem Gerät“ und „Private " +
                "Cloud Compute“ verwenden jeweils nur eine der beiden Methoden, auch wenn die andere " +
                "funktionieren würde. „KI-Assistent (MCP)“ überlässt das Labeln stattdessen vollständig " +
                "einem verbundenen Assistenten und führt es nie automatisch aus."
        )
    }

    static func labelSweepExplanation(provider: FoodLabelProvider) -> String {
        switch provider {
        case .automatic:
            localized(
                "food_label_sweep_explanation_automatic",
                en: "Each unlabeled food below is sent to Apple Intelligence on this device — or, if " +
                    "that's not available, to Apple's Private Cloud Compute — to suggest a few English " +
                    "words for what it is. Suggestions are saved to the food automatically. On-device " +
                    "processing never leaves your phone; Private Cloud Compute processes it on Apple's " +
                    "servers under the same privacy protections and doesn't retain the data.",
                de: "Jedes unbeschriftete Lebensmittel unten wird an Apple Intelligence auf diesem Gerät " +
                    "gesendet – oder, falls das nicht verfügbar ist, an Apples Private Cloud Compute –, um " +
                    "ein paar englische Begriffe dafür vorzuschlagen, was es ist. Vorschläge werden " +
                    "automatisch beim Lebensmittel gespeichert. Die Verarbeitung auf dem Gerät verlässt " +
                    "dein Handy nie; Private Cloud Compute verarbeitet die Daten auf Apples Servern unter " +
                    "denselben Datenschutzvorkehrungen und speichert sie nicht dauerhaft."
            )
        case .onDeviceOnly:
            localized(
                "food_label_sweep_explanation_on_device",
                en: "Each unlabeled food below is sent to Apple Intelligence on this device to suggest a " +
                    "few English words for what it is. Suggestions are saved to the food automatically. " +
                    "Processing happens entirely on this device and never leaves your phone.",
                de: "Jedes unbeschriftete Lebensmittel unten wird an Apple Intelligence auf diesem Gerät " +
                    "gesendet, um ein paar englische Begriffe dafür vorzuschlagen, was es ist. Vorschläge " +
                    "werden automatisch beim Lebensmittel gespeichert. Die Verarbeitung erfolgt vollständig " +
                    "auf dem Gerät und verlässt dein Handy nie."
            )
        case .privateCloudCompute:
            localized(
                "food_label_sweep_explanation_private_cloud",
                en: "Each unlabeled food below is sent to Apple's Private Cloud Compute to suggest a few " +
                    "English words for what it is. Suggestions are saved to the food automatically. " +
                    "Private Cloud Compute processes it on Apple's servers under the same privacy " +
                    "protections as on-device processing and doesn't retain the data.",
                de: "Jedes unbeschriftete Lebensmittel unten wird an Apples Private Cloud Compute gesendet, " +
                    "um ein paar englische Begriffe dafür vorzuschlagen, was es ist. Vorschläge werden " +
                    "automatisch beim Lebensmittel gespeichert. Private Cloud Compute verarbeitet die Daten " +
                    "auf Apples Servern unter denselben Datenschutzvorkehrungen wie bei der Verarbeitung " +
                    "auf dem Gerät und speichert sie nicht dauerhaft."
            )
        case .mcp:
            // `LabelUnlabeledFoodsView` is only reachable while
            // `FoodLabeler.isAvailable` is true, which "AI assistant (MCP)"
            // never is — kept only so this switch stays exhaustive.
            ""
        }
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
