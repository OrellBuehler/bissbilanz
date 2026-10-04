import Foundation

extension BissbilanzAPI {
    // MARK: - Images

    /// Uploads a food or recipe image and returns its `/uploads/<uuid>.webp` URL.
    /// The route reads the `image` form field; `postMultipart` sets the `Origin`
    /// header the server's CSRF check requires of any native multipart POST.
    ///
    /// `purpose` is the route's optional extra form field: `recipe_step` keeps a
    /// cooking-step photo's aspect ratio (up to 1280 px) instead of the square
    /// thumbnail a food or recipe cover gets.
    ///
    /// The MIME type follows the filename's extension: a transparent cut-out is
    /// a `.png`, everything else a JPEG.
    func uploadImage(_ data: Data, filename: String = "food.jpg", purpose: String? = nil) async throws -> String {
        let response: ImageUploadResponse = try await postMultipart(
            "/api/images/upload", data: data, fieldName: "image", filename: filename,
            mimeType: Self.imageMimeType(forFilename: filename),
            fields: purpose.map { ["purpose": $0] } ?? [:]
        )
        return response.imageUrl
    }

    nonisolated static func imageMimeType(forFilename filename: String) -> String {
        let name = filename.lowercased()
        if name.hasSuffix(".png") { return "image/png" }
        if name.hasSuffix(".webp") { return "image/webp" }
        return "image/jpeg"
    }

    /// Attaches or, with a nil `imageUrl`, removes a food's image.
    ///
    /// A partial PATCH rather than a full `FoodCreate` body: that struct's
    /// optional fields are omitted when nil, so a removal sent that way would
    /// never reach the server and the old image would stay.
    func setFoodImage(
        id: String,
        imageUrl: String?,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Food {
        let response: FoodResponse = try await patch(
            "/api/foods/\(id)", body: ImagePatch(imageUrl: imageUrl),
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.food
    }

    /// Attaches or, with a nil `imageUrl`, removes a recipe's image. Same
    /// partial-PATCH reasoning as `setFoodImage`, and the same body shape —
    /// the route reads `imageUrl` off the recipe patch and treats an explicit
    /// null as a removal.
    func setRecipeImage(
        id: String,
        imageUrl: String?,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Recipe {
        let response: RecipeResponse = try await patch(
            "/api/recipes/\(id)", body: ImagePatch(imageUrl: imageUrl),
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.recipe
    }

    /// Whether a URL points at our own API. Used to keep the account's bearer
    /// token off every other host — scheme, host and port must all match, since
    /// a plaintext or different-port variant of the same name is a different
    /// origin.
    func isOwnHost(_ url: URL) -> Bool {
        guard let base = URL(string: baseURL) else { return false }
        return url.scheme == base.scheme && url.host() == base.host() && url.port == base.port
    }

    /// Raw bytes of a server-hosted image. Takes a server-relative path only, so
    /// the account's bearer token cannot be sent anywhere but our own host.
    func downloadImage(path: String) async throws -> Data {
        guard path.hasPrefix("/") else { throw APIError.badRequest("Not a server path") }
        let request = URLRequest(url: try makeURL(path))
        let (data, httpResponse) = try await executeRequestData(request)
        if httpResponse.statusCode >= 400 {
            throw APIError.serverError(httpResponse.statusCode, nil)
        }
        return data
    }
}
