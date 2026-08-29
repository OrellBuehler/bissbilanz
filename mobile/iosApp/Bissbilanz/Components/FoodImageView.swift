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
        LocalImageStore.clear()
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
    }
}
