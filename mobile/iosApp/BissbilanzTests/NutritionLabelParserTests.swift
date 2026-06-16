@testable import Bissbilanz
import CoreGraphics
import Foundation
import Testing

@Suite("Nutrition label parser")
struct NutritionLabelParserTests {
    // MARK: - Whole-label parsing

    @Test("Parses a German EU panel (kJ/kcal, davon, Salz)")
    func parsesGermanPanel() {
        let rows = [
            "Nährwerte pro 100 g",
            "Energie 1569 kJ / 375 kcal",
            "Fett 4,5 g",
            "davon gesättigte Fettsäuren 1,2 g",
            "Kohlenhydrate 71,4 g",
            "davon Zucker 14,0 g",
            "Ballaststoffe 2,0 g",
            "Eiweiß 9,7 g",
            "Salz 1,28 g",
        ]

        let parsed = NutritionLabelParser.parse(rows: rows)

        #expect(parsed.calories == 375)
        #expect(parsed.fat == 4.5)
        #expect(parsed.saturatedFat == 1.2)
        #expect(parsed.carbs == 71.4)
        #expect(parsed.sugar == 14)
        #expect(parsed.fiber == 2)
        #expect(parsed.protein == 9.7)
        #expect(parsed.salt == 1.28)
    }

    @Test("Parses an English EU panel")
    func parsesEnglishEUPanel() {
        let rows = [
            "Energy 1569 kJ / 375 kcal",
            "Fat 4.5 g",
            "of which saturates 1.2 g",
            "Carbohydrate 71.4 g",
            "of which sugars 14 g",
            "Fibre 2 g",
            "Protein 9.7 g",
            "Salt 1.28 g",
        ]

        let parsed = NutritionLabelParser.parse(rows: rows)

        #expect(parsed.calories == 375)
        #expect(parsed.fat == 4.5)
        #expect(parsed.saturatedFat == 1.2)
        #expect(parsed.carbs == 71.4)
        #expect(parsed.sugar == 14)
        #expect(parsed.fiber == 2)
        #expect(parsed.protein == 9.7)
        #expect(parsed.salt == 1.28)
    }

    @Test("Parses a US Nutrition Facts panel with %DV and sodium")
    func parsesUSPanel() {
        let rows = [
            "Nutrition Facts",
            "Serving size 1 cup",
            "Calories 240",
            "Total Fat 8g 10%",
            "Saturated Fat 1g 5%",
            "Trans Fat 0g",
            "Sodium 200mg 9%",
            "Total Carbohydrate 37g 13%",
            "Dietary Fiber 4g 14%",
            "Total Sugars 12g",
            "Protein 3g",
        ]

        let parsed = NutritionLabelParser.parse(rows: rows)

        #expect(parsed.calories == 240)
        #expect(parsed.fat == 8) // first number wins over the %DV column
        #expect(parsed.saturatedFat == 1)
        #expect(parsed.sodium == 200) // mg kept as mg
        #expect(parsed.carbs == 37)
        #expect(parsed.fiber == 4)
        #expect(parsed.sugar == 12)
        #expect(parsed.protein == 3)
        #expect(parsed.salt == nil)
    }

    // MARK: - Energy

    @Test("Converts kJ to kcal when only kJ is printed")
    func convertsKilojoulesOnly() {
        #expect(NutritionLabelParser.parse(rows: ["Energie 1.569 kJ"]).calories == 375) // de thousands dot
        #expect(NutritionLabelParser.parse(rows: ["Energy 2000 kJ"]).calories == 478.01)
    }

    @Test("Prefers kcal when both energies are present")
    func prefersKilocalories() {
        #expect(NutritionLabelParser.parse(rows: ["Brennwert 1000 kJ 239 kcal"]).calories == 239)
    }

    // MARK: - Salt / sodium unit handling

    @Test("Sodium printed in grams is converted to milligrams")
    func sodiumGramsToMilligrams() {
        #expect(NutritionLabelParser.parse(rows: ["Natrium 0,12 g"]).sodium == 120)
    }

    @Test("Salt printed in milligrams is converted to grams")
    func saltMilligramsToGrams() {
        #expect(NutritionLabelParser.parse(rows: ["Salt 320 mg"]).salt == 0.32)
    }

    // MARK: - Specificity / ordering

    @Test("Saturated fat does not overwrite total fat, and vice versa")
    func distinguishesSaturatedFromTotalFat() {
        let parsed = NutritionLabelParser.parse(rows: ["Fat 10 g", "Saturated fat 3 g"])
        #expect(parsed.fat == 10)
        #expect(parsed.saturatedFat == 3)
    }

    @Test("Of-which sugars maps to sugar, not carbohydrate")
    func ofWhichSugarsMapsToSugar() {
        let parsed = NutritionLabelParser.parse(rows: ["Carbohydrate 20 g", "of which sugars 8 g"])
        #expect(parsed.carbs == 20)
        #expect(parsed.sugar == 8)
    }

    @Test("Trans and unsaturated fat sub-rows never pollute total fat")
    func ignoresTransAndUnsaturatedFat() {
        // Order-independent: even if a sub-row is seen before "Total Fat".
        let us = NutritionLabelParser.parse(rows: ["Trans Fat 0 g", "Total Fat 8 g"])
        #expect(us.fat == 8)

        let de = NutritionLabelParser.parse(rows: [
            "einfach ungesättigte Fettsäuren 6 g",
            "mehrfach ungesättigte Fettsäuren 2 g",
            "Fett 10 g",
            "davon gesättigte Fettsäuren 3 g",
        ])
        #expect(de.fat == 10)
        #expect(de.saturatedFat == 3)
    }

    @Test("Ignores lines without a recognized nutrient")
    func ignoresUnrelatedLines() {
        let parsed = NutritionLabelParser.parse(rows: ["INGREDIENTS: water, salt", "Best before 2026"])
        #expect(parsed.isEmpty)
    }

    // MARK: - Number normalization

    @Test("parseDecimal handles comma/point and thousands separators")
    func parseDecimalVariants() {
        #expect(NutritionLabelParser.parseDecimal("4,5") == 4.5)
        #expect(NutritionLabelParser.parseDecimal("4.5") == 4.5)
        #expect(NutritionLabelParser.parseDecimal("1.234,5") == 1234.5) // EU grouping
        #expect(NutritionLabelParser.parseDecimal("1,234.5") == 1234.5) // US grouping
        #expect(NutritionLabelParser.parseDecimal("1 569") == 1569) // space grouping
        #expect(NutritionLabelParser.parseDecimal("1.569", energyKJ: true) == 1569)
        #expect(NutritionLabelParser.parseDecimal("0.5", energyKJ: true) == 0.5)
    }

    // MARK: - Row clustering

    @Test("Clusters a left label and right value on the same baseline into one row")
    func clustersColumnsIntoRows() {
        // Vision coords: origin bottom-left. Two visual rows, each split into a
        // left label box and a right value box that share a baseline.
        let lines = [
            line("Protein", x: 0.1, y: 0.80),
            line("9.7 g", x: 0.7, y: 0.80),
            line("Fat", x: 0.1, y: 0.60),
            line("4.5 g", x: 0.7, y: 0.61),
        ]

        let rows = NutritionLabelParser.assembleRows(from: lines)

        #expect(rows == ["Protein 9.7 g", "Fat 4.5 g"]) // top row first, left-to-right
    }

    @Test("Clustered rows parse end-to-end")
    func clusteredRowsParse() {
        let lines = [
            line("Protein", x: 0.1, y: 0.80),
            line("9.7 g", x: 0.7, y: 0.80),
            line("Fat", x: 0.1, y: 0.60),
            line("4.5 g", x: 0.7, y: 0.60),
        ]

        let parsed = NutritionLabelParser.parse(lines: lines)

        #expect(parsed.protein == 9.7)
        #expect(parsed.fat == 4.5)
    }

    // MARK: - Helpers

    private func line(_ text: String, x: Double, y: Double, height: Double = 0.03) -> OCRTextLine {
        OCRTextLine(
            text: text,
            boundingBox: CGRect(x: x, y: y - height / 2, width: 0.2, height: height)
        )
    }
}
