import Foundation

// New strings for the Private Cloud Compute text-estimate fallback
// (`MealEstimatorPrivateCloud.swift`), kept in their own file rather than
// appended to `Localization.swift` to avoid merge conflicts with the other
// features landing in that shared file at the same time. Same `localized`
// pattern, private to this file (Swift extension access rules make that safe
// alongside the main file's own `private` helper of the same name).
extension L10n {
    static var aiMealPrivateCloudNotice: String {
        localized(
            "ai_meal_private_cloud_notice",
            en: "Apple Intelligence isn't available, but Bissbilanz can estimate using Apple's Private Cloud Compute instead.",
            de: "Apple Intelligence ist nicht verfügbar, aber Bissbilanz kann stattdessen mit Apples Private Cloud Compute schätzen."
        )
    }

    static var aiMealPrivateCloudDisclaimer: String {
        localized(
            "ai_meal_private_cloud_disclaimer",
            en: "Estimated using Apple's Private Cloud Compute — this description was processed on Apple's servers.",
            de: "Geschätzt mit Apples Private Cloud Compute — diese Beschreibung wurde auf Apples Servern verarbeitet."
        )
    }

    static var aiPrivateCloudSectionTitle: String {
        localized("ai_private_cloud_section_title", en: "AI Estimation", de: "KI-Schätzung")
    }

    static var aiPrivateCloudToggleLabel: String {
        localized(
            "ai_private_cloud_toggle_label",
            en: "Use Private Cloud Compute",
            de: "Private Cloud Compute verwenden"
        )
    }

    static var aiPrivateCloudToggleFooter: String {
        localized(
            "ai_private_cloud_toggle_footer",
            en: "When on-device AI can't estimate a meal, Bissbilanz can retry using Apple's Private Cloud Compute. " +
                "Your description is sent to Apple's servers, processed there under the same privacy protections " +
                "as on-device processing, and not stored. Also used for \"Log by Voice\" on Apple Watch, where " +
                "it's the only option.",
            de: "Wenn die KI auf dem Gerät eine Mahlzeit nicht schätzen kann, kann Bissbilanz es stattdessen mit " +
                "Apples Private Cloud Compute versuchen. Deine Beschreibung wird dafür an Apples Server gesendet, " +
                "dort unter denselben Datenschutzvorkehrungen wie auf dem Gerät verarbeitet und nicht gespeichert. " +
                "Wird auf der Apple Watch auch für \"Per Sprache eintragen\" verwendet, wo es die einzige Option ist."
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
