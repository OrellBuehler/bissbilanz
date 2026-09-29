import Foundation

extension BissbilanzAPI {
    // MARK: - Food packages

    /// Brands of the user's foods with per-brand counts — the export filter's options.
    func getFoodBrands() async throws -> [FoodBrandStat] {
        let response: FoodBrandsResponse = try await get("/api/foods/brands")
        return response.brands
    }

    /// Labels on the user's foods (supplements excluded) with per-label counts.
    func getFoodLabelStats() async throws -> [FoodLabelStat] {
        let response: FoodLabelStatsResponse = try await get("/api/foods/labels", params: ["kind": "food"])
        return response.labels
    }

    func summarizeFoodPackage(_ selection: FoodPackageSelection) async throws -> FoodPackageSummary {
        try await post("/api/foods/package/summary", body: selection)
    }

    /// The shareable package for a selection. Raw bytes — the response is a binary
    /// archive, not the JSON envelope `performRequest` expects — plus the name the
    /// server gave it (`Content-Disposition`), so the shared file is named for its content.
    func exportFoodPackage(_ selection: FoodPackageSelection) async throws -> FoodPackageExport {
        var request = URLRequest(url: try makeURL("/api/foods/package/export"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(selection)
        // Photos of a whole food database — allow more than the default 60s
        request.timeoutInterval = 180
        ErrorReporter.addBreadcrumb("POST /api/foods/package/export", category: "http")
        do {
            let (data, httpResponse) = try await executeRequestData(request)
            if httpResponse.statusCode >= 400 {
                throw APIError.serverError(httpResponse.statusCode, String(data: data, encoding: .utf8))
            }
            let filename = FoodPackageFilename.filename(
                fromContentDisposition: httpResponse.value(forHTTPHeaderField: "Content-Disposition")
            ) ?? "\(FoodPackageFilename.genericBase(date: Date())).\(FoodPackageFormat.fileExtension)"
            return FoodPackageExport(data: data, filename: filename)
        } catch {
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw error
        }
    }

    /// New items and conflicts in a package; writes nothing.
    func previewFoodPackage(_ data: Data, filename: String) async throws -> FoodPackagePreview {
        try await postPackage("/api/foods/package/preview", data: data, filename: filename, resolutions: nil)
    }

    /// Imports the previewed file with a resolution per conflict. A stale preview
    /// comes back as `APIError.conflict` — preview again.
    func importFoodPackage(
        _ data: Data,
        filename: String,
        resolutions: FoodPackageResolutions
    ) async throws -> FoodPackageImportResult {
        try await postPackage(
            "/api/foods/package/import", data: data, filename: filename, resolutions: resolutions
        )
    }

    /// A multipart POST with the package as `file` and, for the import, the
    /// resolutions as a JSON `resolutions` part. Sets `Origin` like every other
    /// native multipart POST (see `postMultipart`).
    private func postPackage<T: Decodable>(
        _ path: String,
        data: Data,
        filename: String,
        resolutions: FoodPackageResolutions?
    ) async throws -> T {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL, forHTTPHeaderField: "Origin")
        request.timeoutInterval = 180
        var body = Self.multipartBody(
            boundary: boundary, fieldName: "file", mimeType: "application/zip",
            parts: [(data: data, filename: filename)],
            closing: false
        )
        if let resolutions {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"resolutions\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: application/json\r\n\r\n".data(using: .utf8)!)
            body.append(try encoder.encode(resolutions))
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        return try await performRequest(request)
    }
}
