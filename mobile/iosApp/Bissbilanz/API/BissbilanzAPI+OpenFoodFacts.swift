import Foundation

extension BissbilanzAPI {
    // MARK: - Open Food Facts proxy

    /// A proxy hit: the `Food` prefill plus the raw OFF categories, which are
    /// not part of `Food` and only exist to be handed back on create.
    struct OpenFoodFactsHit {
        let food: Food
        let categoriesTags: [String]?
    }

    /// The proxy returns `{product: {...}}` — the `Food` prefill shape minus
    /// the user-scoped fields (`userId`, `isFavorite`) and with nullable
    /// serving info, so the gaps are patched in before decoding, mirroring
    /// the Local-mode `OpenFoodFactsClient`. Returns nil for unknown barcodes
    /// or unparseable responses.
    func lookupBarcode(_ barcode: String) async throws -> OpenFoodFactsHit? {
        // The barcode is untrusted external input: the scanner accepts Code 39
        // (whose charset includes the space) and Code 128 (full ASCII), so a
        // scan can legitimately produce a string that isn't a valid path
        // segment. Percent-encode against alphanumerics — anything a product
        // code actually contains survives, everything else is escaped rather
        // than reshaping the URL.
        guard let encoded = barcode.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              let url = URL(string: "\(baseURL)/api/openfoodfacts/\(encoded)")
        else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let result: (Data, HTTPURLResponse)
        do {
            result = try await executeRequestData(request)
        } catch {
            ErrorReporter.capture(error, context: ["endpoint": "/api/openfoodfacts/{barcode}"])
            return nil
        }
        let (data, httpResponse) = result
        guard httpResponse.statusCode == 200 else { return nil }
        return Self.openFoodFactsHit(from: data, barcode: barcode)
    }

    /// Same lookup as `lookupBarcode`, but failures propagate instead of
    /// collapsing into nil: a 404 (or an unparseable product) throws
    /// `.notFound` and anything else non-200 — notably the proxy's 429 rate
    /// limit — throws `.serverError`. The bulk "Enhance Foods" sweep needs the
    /// difference to back off on a rate limit rather than report every
    /// remaining food as unknown to Open Food Facts.
    func lookupBarcodeOrThrow(_ barcode: String) async throws -> OpenFoodFactsHit {
        guard let encoded = barcode.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              let url = URL(string: "\(baseURL)/api/openfoodfacts/\(encoded)")
        else { throw APIError.notFound }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, httpResponse) = try await executeRequestData(request)
        if httpResponse.statusCode == 404 { throw APIError.notFound }
        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode, String(data: data, encoding: .utf8))
        }
        guard let hit = Self.openFoodFactsHit(from: data, barcode: barcode) else { throw APIError.notFound }
        return hit
    }

    private static func openFoodFactsHit(from data: Data, barcode: String) -> OpenFoodFactsHit? {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              var product = root["product"] as? [String: Any]
        else { return nil }

        // `Food.id` is required; older servers omit `id` on this endpoint, so the
        // barcode stands in for it like the Local-mode client does.
        if !(product["id"] is String) {
            product["id"] = barcode
        }
        product["userId"] = ""
        product["isFavorite"] = false
        if !(product["servingSize"] is NSNumber) {
            product["servingSize"] = 100
        }
        let unit = product["servingUnit"] as? String
        if ServingUnit(rawValue: unit ?? "") == nil {
            product["servingUnit"] = "g"
        }
        if !(product["barcode"] is String) {
            product["barcode"] = barcode
        }
        let food: Food
        do {
            food = try JSONPatch.decode(Food.self, from: product)
        } catch {
            ErrorReporter.captureWarning("Open Food Facts proxy product decode failed", context: ["reason": ErrorReporter.reason(for: error)])
            return nil
        }
        return OpenFoodFactsHit(food: food, categoriesTags: product["categoriesTags"] as? [String])
    }

    /// One row of `/api/openfoodfacts/search`: enough to render a picker row
    /// and to instantiate the product by barcode (copy-on-use) once picked.
    struct OpenFoodFactsSearchHit: Decodable, Identifiable, Hashable, Sendable {
        let barcode: String
        let name: String
        let brand: String?
        let imageUrl: String?
        let calories: Double
        let protein: Double
        let carbs: Double
        let fat: Double

        var id: String { barcode }
    }

    struct OpenFoodFactsSearchResponse: Decodable {
        let results: [OpenFoodFactsSearchHit]
    }

    func searchOpenFoodFacts(query: String, limit: Int = 10) async throws -> [OpenFoodFactsSearchHit] {
        let response: OpenFoodFactsSearchResponse = try await get(
            "/api/openfoodfacts/search",
            params: ["q": query, "limit": "\(limit)"]
        )
        return response.results
    }
}
