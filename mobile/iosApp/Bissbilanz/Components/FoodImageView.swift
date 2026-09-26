import SwiftUI

/// Loads food and recipe images, cache-first.
///
/// A food's `imageUrl` is either our own `/uploads/…` or a public Open Food
/// Facts URL, and both arrive here. The account's bearer token is attached to
/// the first kind only — never to the second — which is why the two go down
/// separate paths rather than through one authenticated fetch.
///
/// The apps are local-first, so "renders when online" isn't enough: a
/// server-hosted image is written into `LocalImageStore` on first load and
/// served from there afterwards, which is what makes it survive airplane mode.
@MainActor
@Observable
final class FoodImageLoader {
    private let api: BissbilanzAPI
    private let session: URLSession
    // Caches, not view state — nothing renders from them directly, so keep
    // them out of observation tracking.
    @ObservationIgnored private var memory: [String: UIImage] = [:]
    @ObservationIgnored private var inFlight: [String: Task<UIImage?, Never>] = [:]
    /// URLs whose warm download the server refused outright. `warmCache` runs
    /// after every debounced snapshot publish, so without this a row pointing
    /// at a deleted upload would re-request a 404 for the rest of the session.
    @ObservationIgnored private var unwarmable: Set<String> = []

    init(api: BissbilanzAPI, session: URLSession = .shared) {
        self.api = api
        self.session = session
    }

    func image(for imageUrl: String?) async -> UIImage? {
        guard let imageUrl, !imageUrl.isEmpty else { return nil }
        if let cached = memory[imageUrl] { return cached }
        if let existing = inFlight[imageUrl] { return await existing.value }

        let task = Task<UIImage?, Never> { [weak self] in
            guard let self else { return nil }
            let image = await load(imageUrl)
            if let image { memory[imageUrl] = image }
            inFlight[imageUrl] = nil
            return image
        }
        inFlight[imageUrl] = task
        return await task.value
    }

    /// Puts freshly cropped bytes in front of the loader under the URL the
    /// server just returned, so a newly attached image renders straight away
    /// instead of after a round trip — and offline immediately.
    func seed(_ data: Data, for imageUrl: String) {
        if let key = LocalImageStore.cacheKey(for: imageUrl) {
            LocalImageStore.write(data, named: key)
        }
        memory[imageUrl] = UIImage(data: data)
    }

    func evict(_ imageUrl: String?) {
        guard let imageUrl else { return }
        memory[imageUrl] = nil
        LocalImageStore.evict(imageUrl)
    }

    func clear() {
        memory.removeAll()
        unwarmable.removeAll()
        LocalImageStore.clear()
    }

    /// Makes sure the given images exist as files in `LocalImageStore`, and
    /// reports whether anything new landed there.
    ///
    /// For the widget extension, which never touches the network: it renders
    /// favorites straight off disk, so an image nobody has opened in the app
    /// yet would otherwise never appear on the home screen. Only our own
    /// `/uploads/` images are fetched — an Open Food Facts URL has no confined
    /// cache file (and must never carry the account's token), and a `file://`
    /// photo is already on disk.
    ///
    /// Deliberately not routed through `image(for:)`: these bytes are for
    /// another process, and decoding twenty favorites into `memory` would cost
    /// the app tens of megabytes for pictures it is not showing.
    func warmCache(for imageUrls: [String]) async -> Bool {
        var warmed = false
        for imageUrl in imageUrls {
            // The caller may be a background-refresh task the system is about
            // to expire, or a debounced publish a newer save superseded.
            guard !Task.isCancelled else { break }
            guard !unwarmable.contains(imageUrl) else { continue }
            guard let key = LocalImageStore.cacheKey(for: imageUrl),
                  LocalImageStore.cachedFile(for: imageUrl) == nil
            else { continue }
            do {
                let data = try await api.downloadImage(path: imageUrl)
                guard LocalImageStore.write(data, named: key) != nil else { continue }
                warmed = true
            } catch {
                // Only a refusal is remembered: an offline or timed-out
                // download is worth retrying on the next publish.
                if Self.isPermanentFailure(error) { unwarmable.insert(imageUrl) }
            }
        }
        return warmed
    }

    /// Whether the server answered in a way no retry will change — the upload
    /// is gone, or was never ours to fetch.
    private static func isPermanentFailure(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }
        switch apiError {
        case .notFound, .gone, .badRequest:
            return true
        case let .serverError(status, _):
            return (400 ..< 500).contains(status)
        default:
            return false
        }
    }

    private func load(_ imageUrl: String) async -> UIImage? {
        // Locally-attached (Local mode) or localized (downgrade) photos, and
        // anything already downloaded.
        if let file = LocalImageStore.cachedFile(for: imageUrl),
           let data = try? Data(contentsOf: file) {
            return UIImage(data: data)
        }

        if imageUrl.hasPrefix("/") {
            // Ours: authenticated, and kept for offline.
            guard let data = try? await api.downloadImage(path: imageUrl) else { return nil }
            if let key = LocalImageStore.cacheKey(for: imageUrl) {
                LocalImageStore.write(data, named: key)
            }
            return UIImage(data: data)
        }

        // Public product image. Never carries the token, so it must not be a
        // request to our own host wearing an absolute URL.
        guard let url = URL(string: imageUrl), !api.isOwnHost(url) else { return nil }
        guard let (data, _) = try? await session.data(from: url) else { return nil }
        return UIImage(data: data)
    }
}

/// A food or recipe image resolved through [FoodImageLoader]. Renders nothing
/// while loading and nothing at all when there is no image, so it can be
/// dropped into a row without reserving space for a picture that isn't there.
struct FoodImageView: View {
    let imageUrl: String?
    var contentMode: ContentMode = .fill

    @Environment(FoodImageLoader.self) private var loader
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                Color.clear
            }
        }
        .task(id: imageUrl) {
            image = await loader.image(for: imageUrl)
        }
        // Always shown beside the food/recipe name it's a photo of — decorative
        // everywhere it's used.
        .accessibilityHidden(true)
    }
}

/// The photo a food or recipe gets above its name on a form header, in the
/// same centred rounded square `FoodDetailView` opens with so the picture
/// reads the same wherever it appears.
///
/// Renders nothing — not even an empty row — when there is no image, which is
/// what keeps an image-less header identical to what it was before.
struct FoodHeaderImage: View {
    let imageUrl: String?
    /// Side of the square. Smaller where the form opens on a medium detent and
    /// the fields below have to stay reachable without a scroll.
    var size: CGFloat = 160

    /// Square because that is the shape the photo was cropped to when it was
    /// attached — a wide banner would crop the user's framing a second time.
    var body: some View {
        if let imageUrl, !imageUrl.isEmpty {
            FoodImageView(imageUrl: imageUrl)
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)
        }
    }
}
