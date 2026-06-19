import CoreGraphics
import Foundation
import Vision

/// Runs on-device Vision OCR over a nutrition-facts image and hands the text to
/// `NutritionLabelParser`. No network, no entitlement beyond camera.
///
/// Two recognition frontends feed the same parser:
/// - **iOS 18+** `RecognizeTextRequest` reads text lines; the parser clusters
///   them into rows spatially.
/// - **iOS 26+** `RecognizeDocumentsRequest` returns native table structure
///   (rows/columns/cells), which is far more reliable for a tabular panel. It
///   is `#if compiler(>=6.2)` gated so the project still builds against the
///   iOS 18 SDK (Xcode 16), mirroring `LiquidGlass.swift`. When it yields no
///   usable table, recognition falls back to the line path.
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
}
