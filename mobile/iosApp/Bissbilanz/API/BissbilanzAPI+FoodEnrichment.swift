import Foundation

extension BissbilanzAPI {
    func getFoodEnrichmentStatus() async throws -> FoodEnrichmentStatus {
        try await foodEnrichmentRequest("GET", "/api/foods/enrichment")
    }

    func startFoodEnrichment() async throws -> FoodEnrichmentStatus {
        try await foodEnrichmentRequest("POST", "/api/foods/enrichment")
    }

    func cancelFoodEnrichment() async throws -> FoodEnrichmentStatus {
        try await foodEnrichmentRequest("DELETE", "/api/foods/enrichment")
    }

    func enrichFood(id: String) async throws -> FoodEnrichResponse {
        try await foodEnrichmentRequest("POST", "/api/foods/\(id)/enrich")
    }

    private func foodEnrichmentRequest<T: Decodable>(_ method: String, _ path: String) async throws -> T {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        ErrorReporter.addBreadcrumb("\(method) \(path)", category: "http")
        let (data, response) = try await executeRequestData(request)
        guard (200 ..< 300).contains(response.statusCode) else {
            let failure = FoodEnrichmentFailure(
                status: response.statusCode,
                body: data,
                retryAfter: response.value(forHTTPHeaderField: "Retry-After")
            )
            if failure.isExpected {
                ErrorReporter.addBreadcrumb(
                    "food enrichment rejected",
                    category: "food-enrichment",
                    data: ["method": method, "endpoint": path, "status_code": response.statusCode]
                )
            } else {
                let error = APIError.serverError(response.statusCode, String(data: data, encoding: .utf8))
                ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            }
            throw failure
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            let decodingError = APIError.decodingError(
                error,
                statusCode: response.statusCode,
                body: String(data: data, encoding: .utf8)
            )
            ErrorReporter.capture(decodingError, context: Self.errorContext(for: request, error: decodingError))
            throw decodingError
        }
    }
}
