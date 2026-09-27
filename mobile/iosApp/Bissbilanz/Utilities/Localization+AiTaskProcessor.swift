import Foundation

// Strings for the device AI task processor (`AiTaskProcessor`, the
// `SettingsView` "AI Task Processing" section, and the `AIMealSheet` /
// `AiTasksView` copy that follows the chosen processor) — kept in their own
// file rather than appended to `Localization.swift` for the same
// merge-conflict reason as `Localization+PrivateCloudCompute.swift`. Same
// `localized` pattern, private to this file.
extension L10n {
    static var aiTaskProcessorSectionTitle: String {
        localized("ai_task_processor_section_title", en: "AI Task Processing", de: "KI-Aufgabenverarbeitung")
    }

    static var aiTaskProcessorPickerLabel: String {
        localized("ai_task_processor_picker_label", en: "Process queued tasks with", de: "Warteschlangen-Aufgaben verarbeiten mit")
    }

    static var aiTaskProcessorOptionAssistant: String {
        localized("ai_task_processor_option_assistant", en: "My AI assistant (MCP)", de: "Mein KI-Assistent (MCP)")
    }

    static var aiTaskProcessorOptionDevice: String {
        localized("ai_task_processor_option_device", en: "This iPhone", de: "Dieses iPhone")
    }

    static var aiTaskProcessorAutoLogToggle: String {
        localized("ai_task_processor_auto_log_toggle", en: "Log automatically", de: "Automatisch eintragen")
    }

    static var aiTaskProcessorAutoLogFooter: String {
        localized(
            "ai_task_processor_auto_log_footer",
            en: "Off (the default) holds what this iPhone finds for you to review in AI Tasks before anything " +
                "is logged. On logs it immediately instead.",
            de: "Aus (Standard) hält das, was dieses iPhone findet, unter KI-Aufgaben zur Überprüfung bereit, " +
                "bevor etwas eingetragen wird. An trägt es stattdessen sofort ein."
        )
    }

    static var aiTaskProcessorCapabilityOnDeviceLabel: String {
        localized("ai_task_processor_capability_on_device_label", en: "On-device model", de: "Modell auf dem Gerät")
    }

    static var aiTaskProcessorOnDeviceAvailable: String {
        localized("ai_task_processor_on_device_available", en: "Available", de: "Verfügbar")
    }

    static var aiTaskProcessorCapabilityPhotoLabel: String {
        localized("ai_task_processor_capability_photo_label", en: "Photo support", de: "Fotounterstützung")
    }

    static var aiTaskProcessorCapabilityPccLabel: String {
        localized(
            "ai_task_processor_capability_pcc_label",
            en: "Private Cloud Compute",
            de: "Private Cloud Compute"
        )
    }

    static var aiTaskProcessorSupported: String {
        localized("ai_task_processor_supported", en: "Supported", de: "Unterstützt")
    }

    static var aiTaskProcessorNotSupported: String {
        localized("ai_task_processor_not_supported", en: "Not supported", de: "Nicht unterstützt")
    }

    static var aiTaskProcessorDeviceWarning: String {
        localized(
            "ai_task_processor_device_warning",
            en: "This iPhone currently can't estimate meals (Apple Intelligence is unavailable), so tasks will " +
                "stay pending until it can.",
            de: "Dieses iPhone kann derzeit keine Mahlzeiten schätzen (Apple Intelligence ist nicht verfügbar), " +
                "daher bleiben Aufgaben offen, bis es das wieder kann."
        )
    }

    static var aiTaskProcessLaterButton: String {
        localized("ai_task_process_later_button", en: "Process Later", de: "Später verarbeiten")
    }

    static var aiTaskProcessorNothingFoundReason: String {
        localized(
            "ai_task_processor_nothing_found_reason",
            en: "Nothing your iPhone could log was found in this task.",
            de: "Es wurde nichts gefunden, was dein iPhone eintragen konnte."
        )
    }

    static func aiTaskProcessorResultSummary(_ items: String, _ kcal: Int) -> String {
        localized(
            "ai_task_processor_result_summary",
            en: "Logged \(items) (≈\(kcal) kcal)",
            de: "Eingetragen: \(items) (≈\(kcal) kcal)"
        )
    }

    static var aiTaskProcessorScannedProductName: String {
        localized("ai_task_processor_scanned_product_name", en: "Scanned product", de: "Gescanntes Produkt")
    }

    static var aiTaskProcessorNewFoodBadge: String {
        localized("ai_task_processor_new_food_badge", en: "New food", de: "Neues Lebensmittel")
    }

    static var aiTaskProcessorReadyForReview: String {
        localized("ai_task_processor_ready_for_review", en: "Ready to Review", de: "Bereit zur Überprüfung")
    }

    static var aiTaskProcessorReviewHint: String {
        localized(
            "ai_task_processor_review_hint",
            en: "Your iPhone found this — tap to review before it's logged.",
            de: "Dein iPhone hat das gefunden — tippe, um es vor dem Eintragen zu überprüfen."
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
