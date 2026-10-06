import Foundation

/// One entry of the `POST /api/foods/bulk` response, in the order the foods were sent.
/// `status` is `created`, `exists` (the id was already this user's food: a retried
/// request), `id_conflict` (the id belongs to someone else), `duplicate_barcode` or
/// `invalid`; `message` carries the reason for `invalid` and, on a `created` food, why its
/// photo was left out (`image_too_large`, `image_invalid`, `quota_exceeded`).
struct BulkFoodResult: Decodable, Equatable, Sendable {
    let id: String
    let status: String
    let imageUrl: String?
    let message: String?
}

enum BulkUploadError: Error, Equatable {
    /// HTTP 429 from the bulk route's own rate limit (30 requests a minute per user).
    case rateLimited(retryAfter: TimeInterval)
}

struct BulkFoodsResponse: Decodable {
    let results: [BulkFoodResult]
}

extension BissbilanzAPI {
    /// Sends up to 200 foods and their photos as one multipart request. `Origin` is set
    /// explicitly like every other native multipart POST (see `postMultipart`).
    func postBulkFoods(body: Data, boundary: String) async throws -> [BulkFoodResult] {
        var request = URLRequest(url: try makeURL("/api/foods/bulk"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL, forHTTPHeaderField: "Origin")
        request.timeoutInterval = 180
        request.httpBody = body
        ErrorReporter.addBreadcrumb("POST /api/foods/bulk", category: "http")

        let (data, response) = try await executeRequestData(request)
        switch response.statusCode {
        case 429:
            throw BulkUploadError.rateLimited(
                retryAfter: AiTaskRequestInProgress.retryDelay(header: response.value(forHTTPHeaderField: "Retry-After"))
            )
        case 400:
            throw APIError.badRequest(String(data: data, encoding: .utf8))
        case 400...:
            throw APIError.serverError(response.statusCode, String(data: data, encoding: .utf8))
        default:
            break
        }
        do {
            return try JSONDecoder().decode(BulkFoodsResponse.self, from: data).results
        } catch {
            throw APIError.decodingError(
                error, statusCode: response.statusCode, body: String(data: data, encoding: .utf8)
            )
        }
    }
}
