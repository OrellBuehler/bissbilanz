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
    /// the Local-mode `OpenFoodFactsClient`. Returns nil only when the server
    /// definitively has no such product (404, or 400 for a code that is not a
    /// valid barcode); a failed request (offline, timeout, 429, 5xx) or a
    /// response that cannot be read throws, so callers can tell "unknown
    /// product" apart from "lookup failed".
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
        let (data, httpResponse) = try await executeRequestData(request)
        return try Self.openFoodFactsHit(status: httpResponse.statusCode, data: data, barcode: barcode)
    }

    nonisolated static func openFoodFactsHit(status: Int, data: Data, barcode: String) throws -> OpenFoodFactsHit? {
        switch status {
        case 200:
            return try openFoodFactsHit(from: data, barcode: barcode)
        case 400, 404:
            return nil
        default:
            throw APIError.serverError(status, String(data: data, encoding: .utf8))
        }
    }

    nonisolated static func openFoodFactsHit(from data: Data, barcode: String) throws -> OpenFoodFactsHit {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              var product = root["product"] as? [String: Any]
        else {
            throw APIError.decodingError(
                DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Open Food Facts proxy response has no product")),
                statusCode: 200,
                body: String(data: data, encoding: .utf8)
            )
        }

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
            throw APIError.decodingError(error, statusCode: 200, body: String(data: data, encoding: .utf8))
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
