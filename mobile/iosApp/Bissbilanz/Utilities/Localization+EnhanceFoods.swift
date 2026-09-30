import Foundation

// Strings for the "Enhance Foods" bulk sweep (`EnhanceFoodsView`), kept in
// their own file rather than appended to `Localization.swift` for the same
// reason `Localization+FoodLabels.swift` is: avoiding merge conflicts with
// other features landing in that shared file at the same time.
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
            en: "Looks up each food's barcode on Open Food Facts and loads its Nutri-Score, NOVA group and nutrition label details (extended nutrients, ingredients and additives). Names, serving sizes and your calories and macros are never changed. Only foods with a barcode can be enhanced, and foods Open Food Facts has no scores for stay in the list.",
            de: "Sucht den Barcode jedes Lebensmittels bei Open Food Facts und lädt Nutri-Score, NOVA-Gruppe und Nährwertangaben (erweiterte Nährstoffe, Zutaten und Zusatzstoffe). Namen, Portionsgrößen sowie deine Kalorien und Makros werden nie geändert. Nur Lebensmittel mit Barcode können angereichert werden, und Lebensmittel ohne Werte bei Open Food Facts bleiben in der Liste."
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
            en: "Waiting for the rate limit to clear…",
            de: "Warte auf das Anfragelimit…"
        )
    }

    static func enhanceFoodsSummary(updated: Int, notFound: Int, failed: Int) -> String {
        let en = "Enhanced \(updated) \(updated == 1 ? "food" : "foods")"
            + (notFound == 0 ? "" : ", \(notFound) not found on Open Food Facts")
            + (failed == 0 ? "" : ", \(failed) failed")
            + "."
        let de = "\(updated) Lebensmittel angereichert"
            + (notFound == 0 ? "" : ", \(notFound) nicht bei Open Food Facts gefunden")
            + (failed == 0 ? "" : ", \(failed) fehlgeschlagen")
            + "."
        return localized("enhance_foods_summary", en: en, de: de)
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
