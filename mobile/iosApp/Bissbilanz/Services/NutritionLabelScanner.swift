import CoreGraphics
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif
import ImageIO
import Vision

/// Reads a nutrition-facts image and hands the result to `NutritionLabelParser`
/// (Vision) or a `@Generable` struct (Foundation Models). No network, no
/// entitlement beyond camera.
///
/// Three recognition frontends feed into the same `ParsedNutrition` result:
/// - **iOS 18+** `RecognizeTextRequest` reads text lines; the parser clusters
///   them into rows spatially.
/// - **iOS 26+** `RecognizeDocumentsRequest` returns native table structure
///   (rows/columns/cells), which is far more reliable for a tabular panel. It
///   is `#if compiler(>=6.2)` gated so the project still builds against the
///   iOS 18 SDK (Xcode 16), mirroring `LiquidGlass.swift`. When it yields no
///   usable table, recognition falls back to the line path.
/// - **iOS 27+** sends the photo straight to Foundation Models (real language
///   understanding of the whole panel, not per-line OCR), gated
///   `#if compiler(>=6.4)` the same way `SiriIOS27.swift` gates new-in-iOS-27
///   symbols (`Attachment`, `OCRTool`, `BarcodeReaderTool`) that don't exist
///   in older SDKs at all. When available, its result is validated and
///   merged with the Vision+parser result (`NutritionLabelValidator`) rather
///   than trusted outright, and any failure — unavailable model, thrown
///   error, or an implausible result — falls back to Vision+parser, which
///   remains the only path on iOS < 27.
struct NutritionLabelScanner {
    enum ScanError: Error {
        case invalidImage
    }

    /// Words seeded into the recognizer so EN/DE nutrition terms survive
    /// language correction.
    private static let customWords = [
        "kcal", "kJ", "davon", "Zucker", "gesättigte", "Eiweiß",
        "Ballaststoffe", "Salz", "Natrium", "Energie", "Brennwert",
    ]

    private static let recognitionLanguages = [
        Locale.Language(identifier: "en"),
        Locale.Language(identifier: "de"),
    ]

    /// `imageData` is an up-oriented encoded image (JPEG/PNG). Passing `Data`
    /// keeps the call Sendable across the concurrency boundary; Vision decodes
    /// and reads orientation from it.
    func scan(_ imageData: Data) async throws -> ParsedNutrition {
        #if compiler(>=6.4)
        if #available(iOS 27, *) {
            do {
                if let extraction = try await scanWithFoundationModel(imageData) {
                    let fallback = try await scanWithVision(imageData)
                    return NutritionLabelValidator.merge(
                        model: extraction.parsedNutrition,
                        fallback: fallback,
                        computedFromServing: !extraction.valuesAreBasisPer100
                    )
                }
            } catch {
                ErrorReporter.captureWarning(
                    "Nutrition label Foundation Models scan failed",
                    context: ["reason": ErrorReporter.reason(for: error)]
                )
            }
        }
        #endif
        return try await scanWithVision(imageData)
    }

    // MARK: - Vision + regex parser (iOS 18 baseline, also the iOS < 27 path)

    private func scanWithVision(_ imageData: Data) async throws -> ParsedNutrition {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            let rows = try await recognizeDocumentRows(imageData)
            if !rows.isEmpty {
                let parsed = NutritionLabelParser.parse(rows: rows)
                if parsed.hasCoreMacros {
                    return parsed
                }
            }
        }
        #endif
        return try await NutritionLabelParser.parse(lines: recognizeTextLines(imageData))
    }

    // MARK: - iOS 18 line-based recognition

    private func recognizeTextLines(_ imageData: Data) async throws -> [OCRTextLine] {
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = Self.recognitionLanguages
        request.customWords = Self.customWords

        let observations = try await request.perform(on: imageData)
        return observations.compactMap { observation in
            guard let text = observation.topCandidates(1).first?.string else { return nil }
            return OCRTextLine(text: text, boundingBox: observation.boundingBox.cgRect)
        }
    }

    // MARK: - iOS 26 document/table recognition

    #if compiler(>=6.2)
    @available(iOS 26.0, *)
    private func recognizeDocumentRows(_ imageData: Data) async throws -> [String] {
        let request = RecognizeDocumentsRequest()
        let observations = try await request.perform(on: imageData)
        guard let document = observations.first?.document else { return [] }

        // Join each detected table row's cells left-to-right into one string —
        // the parser handles the rest. Uses only the for-in / cell.content.text
        // .transcript access pattern documented for the API (WWDC25 #272).
        var rows: [String] = []
        for table in document.tables {
            for row in table.rows {
                var cells: [String] = []
                for cell in row {
                    cells.append(cell.content.text.transcript)
                }
                let line = cells.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
                if !line.isEmpty {
                    rows.append(line)
                }
            }
        }
        return rows
    }
    #endif

    // MARK: - iOS 27 Foundation Models recognition

    #if compiler(>=6.4)

    @available(iOS 27, *)
    private static let foundationModelInstructions = """
    You are reading a nutrition-facts panel photographed from a food package label. \
    The label may be printed in German, English, or a mix of both — common German \
    terms are Energie/Brennwert (energy), Eiweiß (protein), Kohlenhydrate \
    (carbohydrate), davon Zucker (of which sugars), Fett (fat), davon gesättigte \
    Fettsäuren (of which saturates), Ballaststoffe (fibre) and Salz (salt). Use the OCR \
    tool if the print is too small or dense to read confidently yourself, and use the \
    barcode tool if a barcode is visible anywhere in the photo.

    Energy is usually printed as both kJ and kcal (e.g. "1569 kJ / 375 kcal") — always \
    report the kcal figure. If only kJ is printed, convert it to kcal by dividing by \
    4.184.

    Labels commonly print two columns: a "per 100 g"/"per 100 ml" ("pro 100 g") column \
    and a "per portion"/"per serving" ("pro Portion") column. Always report the \
    nutrient fields below on a per-100 g/ml basis. If the label only shows a \
    per-serving column, read the serving size (e.g. "30 g" or "1 bar (30 g)") and \
    compute the per-100 g/ml values yourself from it; when you do this conversion, set \
    valuesAreBasisPer100 to false.

    Only fill in a field when its value is actually printed (or unambiguously \
    computable from the serving size) on the label — set it to nil rather than \
    guessing or estimating a plausible-looking number.
    """

    /// Returns nil (rather than throwing) when the model isn't available or the
    /// photo can't be decoded, so the caller falls straight through to Vision
    /// without treating either as an error. Genuine generation failures are
    /// still thrown, so the caller can log them before falling back.
    @available(iOS 27, *)
    private func scanWithFoundationModel(_ imageData: Data) async throws -> NutritionLabelExtraction? {
        guard case .available = SystemLanguageModel.default.availability else { return nil }
        guard let cgImage = Self.decodeCGImage(imageData) else { return nil }

        let session = LanguageModelSession(
            tools: [OCRTool(), BarcodeReaderTool()],
            instructions: Self.foundationModelInstructions
        )
        let response = try await session.respond(generating: NutritionLabelExtraction.self) {
            "Extract the nutrition facts — and the barcode, if one is visible — from this label photo."
            Attachment(cgImage)
        }
        return response.content
    }

    private static func decodeCGImage(_ data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    #endif
}

#if compiler(>=6.4)

/// Structured nutrition-label extraction produced by Foundation Models.
/// Mirrors `ParsedNutrition`'s field set (see its doc comment for the split
/// between core and extended fields) plus the serving/basis metadata the
/// model needs to normalize a per-serving-only label to a per-100 basis, and
/// a barcode captured from the same photo via `BarcodeReaderTool`.
@available(iOS 27, *)
@Generable
private struct NutritionLabelExtraction {
    @Guide(
        description: "True if the fields below were read directly from a per-100 g/ml column; " +
            "false if you computed them yourself from a per-serving-only column"
    )
    let valuesAreBasisPer100: Bool

    @Guide(description: "The serving size number printed on the label (e.g. 30 for \"30 g\"), if shown")
    let servingSizeValue: Double?

    @Guide(description: "The unit printed after the serving size, \"g\" or \"ml\"")
    let servingSizeUnit: String?

    @Guide(description: "Energy per 100 g/ml in kcal (converted from kJ if that's the only figure printed)")
    let calories: Double?

    @Guide(description: "Protein per 100 g/ml in grams (Eiweiß)")
    let protein: Double?

    @Guide(description: "Total carbohydrate per 100 g/ml in grams (Kohlenhydrate)")
    let carbs: Double?

    @Guide(description: "Sugars per 100 g/ml in grams — the \"of which sugars\"/\"davon Zucker\" row")
    let sugar: Double?

    @Guide(description: "Total fat per 100 g/ml in grams (Fett)")
    let fat: Double?

    @Guide(
        description: "Saturated fat per 100 g/ml in grams — \"of which saturates\"/\"davon gesättigte Fettsäuren\""
    )
    let saturatedFat: Double?

    @Guide(description: "Dietary fibre per 100 g/ml in grams (Ballaststoffe)")
    let fiber: Double?

    @Guide(description: "Salt per 100 g/ml in grams (Salz), converted from milligrams if necessary")
    let salt: Double?

    @Guide(description: "Sodium per 100 g/ml in milligrams (Natrium), converted from grams if necessary")
    let sodium: Double?

    @Guide(description: "Monounsaturated fat per 100 g/ml in grams, only if broken out separately on the label")
    let monounsaturatedFat: Double?

    @Guide(description: "Polyunsaturated fat per 100 g/ml in grams, only if broken out separately on the label")
    let polyunsaturatedFat: Double?

    @Guide(description: "Trans fat per 100 g/ml in grams, only if printed")
    let transFat: Double?

    @Guide(description: "Cholesterol per 100 g/ml in milligrams, only if printed")
    let cholesterol: Double?

    @Guide(description: "Potassium per 100 g/ml in milligrams, only if printed")
    let potassium: Double?

    @Guide(description: "Calcium per 100 g/ml in milligrams, only if printed")
    let calcium: Double?

    @Guide(description: "Iron per 100 g/ml in milligrams, only if printed")
    let iron: Double?

    @Guide(description: "Vitamin D per 100 g/ml in micrograms, only if printed")
    let vitaminD: Double?

    @Guide(description: "Added sugars per 100 g/ml in grams, only if broken out separately from total sugars")
    let addedSugars: Double?

    @Guide(
        description: "The digits of a barcode (EAN-13/UPC-A/etc.) decoded with the barcode tool, if one is " +
            "visible anywhere in the photo"
    )
    let barcodeValue: String?
}

/// Kept as a plain extension, outside the `@Generable` struct's own member
/// list, so the macro only ever sees the stored `@Guide` properties above.
/// `NutritionLabelExtraction` is already `private` (file-scoped), so the
/// extension can't be marked `fileprivate` itself — it inherits the same
/// file-scoped visibility from the type it extends.
@available(iOS 27, *)
extension NutritionLabelExtraction {
    var parsedNutrition: ParsedNutrition {
        var result = ParsedNutrition()
        result.calories = calories
        result.protein = protein
        result.carbs = carbs
        result.sugar = sugar
        result.fat = fat
        result.saturatedFat = saturatedFat
        result.fiber = fiber
        result.salt = salt
        result.sodium = sodium
        result.monounsaturatedFat = monounsaturatedFat
        result.polyunsaturatedFat = polyunsaturatedFat
        result.transFat = transFat
        result.cholesterol = cholesterol
        result.potassium = potassium
        result.calcium = calcium
        result.iron = iron
        result.vitaminD = vitaminD
        result.addedSugars = addedSugars
        result.barcode = barcodeValue
        return result
    }
}

#endif
