@testable import Bissbilanz
import Foundation
import Testing

/// Covers the decisions that keep food and recipe images correct and safe:
/// which URLs count as our own uploads (and are therefore cached on device),
/// which hosts may receive the account's bearer token, how a removal is
/// encoded, and that the widget snapshot stays readable across the schema
/// change that added images to it.
///
/// The file-system half of `LocalImageStore` is not covered here — it resolves
/// through the App Group container, which is unavailable in a unit-test host.
@MainActor
struct FoodImageTests {
    @Test("Our own uploads resolve to a cache key")
    func cacheKeyForUploads() {
        #expect(
            LocalImageStore.cacheKey(for: "/uploads/a1b2c3d4-0000-4000-8000-000000000001.webp")
                == "a1b2c3d4-0000-4000-8000-000000000001.webp"
        )
    }

    @Test("Nothing else is treated as one of our uploads")
    func cacheKeyRejectsEverythingElse() {
        let rejected = [
            "https://images.openfoodfacts.org/images/products/1/front.jpg",
            "/uploads/../../etc/passwd",
            "/uploads/notes.txt",
            "/uploads/.webp",
            "/uploads/NOTHEX.webp",
            "file:///var/mobile/local-1.jpg",
            "",
        ]
        for url in rejected {
            #expect(LocalImageStore.cacheKey(for: url) == nil, "should reject \(url)")
        }
        #expect(LocalImageStore.cacheKey(for: nil) == nil)
    }

    @Test("Only our own origin is treated as the API host")
    func ownHostIsExact() throws {
        let harness = try RepositoryHarness()
        let host = URL(string: harness.baseURL)!.host()!

        #expect(harness.api.isOwnHost(URL(string: "\(harness.baseURL)/uploads/x.webp")!))
        // A food's imageUrl may hold a public product photo; the token must
        // never travel there, nor to a lookalike, a plaintext downgrade or
        // another port on the same name.
        #expect(!harness.api.isOwnHost(URL(string: "https://images.openfoodfacts.org/1/front.jpg")!))
        #expect(!harness.api.isOwnHost(URL(string: "https://\(host).evil.test/uploads/x.webp")!))
        #expect(!harness.api.isOwnHost(URL(string: "http://\(host)/uploads/x.webp")!))
        #expect(!harness.api.isOwnHost(URL(string: "https://\(host):8443/uploads/x.webp")!))
    }

    /// `WidgetSnapshotStore.load` decodes with `try?`, so a schema change that
    /// old blobs cannot satisfy does not fail loudly — it blanks every widget
    /// on the home screen and the watch face until the app next runs.
    @Test("A snapshot written before favorites had images still decodes")
    func snapshotDecodesWithoutFavoriteImageUrl() throws {
        let legacy = """
        {"date":"2026-09-21","localeCode":"de","calories":1200,"protein":80,
        "carbs":120,"fat":40,"fiber":20,"calorieGoal":2000,"proteinGoal":150,
        "carbGoal":220,"fatGoal":70,"fiberGoal":30,"meals":[],
        "latestWeightKg":null,"latestWeightDate":null,
        "favorites":[{"id":"f1","name":"Skyr","calories":98}],
        "generatedAt":780000000}
        """.data(using: .utf8)!

        let snapshot = try JSONDecoder().decode(WidgetSnapshot.self, from: legacy)
        #expect(snapshot.favorites.count == 1)
        #expect(snapshot.favorites.first?.name == "Skyr")
        #expect(snapshot.favorites.first?.imageUrl == nil)
    }

    @Test("A favorite's image rides along in the snapshot")
    func snapshotCarriesFavoriteImageUrl() throws {
        let favorite = WidgetSnapshot.FavoriteFood(
            id: "f1", name: "Skyr", calories: 98, imageUrl: "/uploads/a1b2.webp"
        )
        let encoded = try JSONEncoder().encode(favorite)
        let decoded = try JSONDecoder().decode(WidgetSnapshot.FavoriteFood.self, from: encoded)
        #expect(decoded.imageUrl == "/uploads/a1b2.webp")
        // The gallery placeholder has no images, and must stay decodable.
        #expect(WidgetSnapshot.placeholder.favorites.allSatisfy { $0.imageUrl == nil })
    }

    @Test("An image removal encodes an explicit null")
    func imagePatchEncodesNull() throws {
        let removal = try JSONEncoder().encode(ImagePatch(imageUrl: nil))
        let decoded = try JSONSerialization.jsonObject(with: removal) as? [String: Any]
        // Not merely absent: an omitted key reads as "leave the image alone".
        #expect(decoded?["imageUrl"] is NSNull)

        let attach = try JSONEncoder().encode(ImagePatch(imageUrl: "/uploads/x.webp"))
        let attached = try JSONSerialization.jsonObject(with: attach) as? [String: Any]
        #expect(attached?["imageUrl"] as? String == "/uploads/x.webp")
    }
}
