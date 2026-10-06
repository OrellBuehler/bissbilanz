@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// A lock-protected photo store standing in for `LocalImageStore`, whose App Group
/// directory does not exist for an unsigned test host.
final class BulkImageRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [String: Data] = [:]

    var writer: BulkImageWriter {
        { data, filename in
            self.lock.lock()
            defer { self.lock.unlock() }
            self.stored[filename] = data
            return "file:///memory/\(filename)"
        }
    }

    var filenames: [String] {
        lock.lock()
        defer { lock.unlock() }
        return stored.keys.sorted()
    }

    func data(_ filename: String) -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return stored[filename]
    }
}

/// Collects progress callbacks, which arrive on the importer's executor.
final class BulkProgressLog: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [BulkImportProgress] = []
    private var callback: (@Sendable () -> Void)?

    func record(_ progress: BulkImportProgress) {
        lock.lock()
        values.append(progress)
        let notify = callback
        lock.unlock()
        notify?()
    }

    /// Runs `callback` on every progress report from now on.
    func onRecord(_ callback: @escaping @Sendable () -> Void) {
        lock.lock()
        defer { lock.unlock() }
        self.callback = callback
    }

    var all: [BulkImportProgress] {
        lock.lock()
        defer { lock.unlock() }
        return values
    }
}

enum BulkPackageFixtures {
    /// The 8x8 WebP inside the food package fixture, as `sharp` wrote it.
    static let webP = Data(base64Encoded:
        "UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoIAAgAAoBCJaACdLoAA5gA/uuOX6FPtRTsP/nEv5I/QLtAAAA="
    )!

    static func food(
        _ number: Int, name: String? = nil, brand: String? = nil, barcode: String? = nil,
        image: Bool = false, labels: [String] = ["snack"]
    ) -> [String: Any] {
        var food: [String: Any] = [
            "ref": "f\(number)", "role": "selected", "name": name ?? "Food \(number)",
            "servingSize": 100, "servingUnit": "g",
            "calories": 100, "protein": 1, "carbs": 2, "fat": 3, "fiber": 4,
            "labels": labels,
        ]
        if let brand { food["brand"] = brand }
        if let barcode { food["barcode"] = barcode }
        if image { food["image"] = "images/f\(number).webp" }
        return food
    }

    static func manifest(foods: [[String: Any]], recipes: [[String: Any]] = []) throws -> Data {
        let root: [String: Any] = [
            "format": FoodPackageFormat.format, "formatVersion": 1, "exportedAt": "2026-10-06T00:00:00.000Z",
            "foods": foods, "recipes": recipes,
        ]
        return try JSONSerialization.data(withJSONObject: root)
    }

    /// Writes a package to a temporary file: the manifest deflated, photos stored, like the crawler.
    static func writePackage(manifest: Data, images: [String: Data] = [:]) throws -> URL {
        var writer = ZipWriter(date: Date(timeIntervalSince1970: 1_790_000_000))
        try writer.add(name: "README.txt", data: Data("readme".utf8), compress: true)
        try writer.add(name: FoodPackageFormat.manifestName, data: manifest, compress: true)
        for (path, data) in images.sorted(by: { $0.key < $1.key }) {
            try writer.add(name: path, data: data, compress: false)
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bulk-\(UUID().uuidString).bissbilanz")
        try writer.finish().write(to: url)
        return url
    }

    static func remove(_ url: URL) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            Issue.record("could not remove \(url.lastPathComponent): \(error)")
        }
    }
}

@Suite("Manifest scanner")
struct ManifestScannerTests {
    private func scan(_ text: String, chunk: Int? = nil) throws -> (foods: [Data], header: ManifestHeader) {
        var foods: [Data] = []
        let scanner = ManifestScanner { foods.append($0) }
        let bytes = Data(text.utf8)
        if let chunk {
            var offset = 0
            while offset < bytes.count {
                try scanner.feed(bytes.subdata(in: offset ..< min(offset + chunk, bytes.count)))
                offset += chunk
            }
        } else {
            try scanner.feed(bytes)
        }
        try scanner.finish()
        return (foods, scanner.header)
    }

    private func names(_ foods: [Data]) throws -> [String] {
        try foods.map { element in
            let object = try #require(JSONSerialization.jsonObject(with: element) as? [String: Any])
            return try #require(object["name"] as? String)
        }
    }

    @Test("Yields each food whatever order the top-level keys come in")
    func anyKeyOrder() throws {
        let orders = [
            #"{"format":"bissbilanz.food-package","formatVersion":1,"foods":[{"name":"A"},{"name":"B"}],"recipes":[]}"#,
            #"{"recipes":[],"foods":[{"name":"A"},{"name":"B"}],"formatVersion":1,"format":"bissbilanz.food-package"}"#,
            #"{"foods":[{"name":"A"},{"name":"B"}],"exportedAt":"2026-10-06","formatVersion":1,"format":"bissbilanz.food-package"}"#,
        ]
        for text in orders {
            let result = try scan(text)
            #expect(try names(result.foods) == ["A", "B"])
            #expect(result.header.format == FoodPackageFormat.format)
            #expect(result.header.formatVersion == 1)
            #expect(result.header.foodCount == 2)
            try result.header.validate()
        }
    }

    @Test("Braces, brackets, quotes and escapes inside strings do not move the nesting")
    func escapedStrings() throws {
        let text = #"""
        {"format":"bissbilanz.food-package","formatVersion":1,"foods":[
          {"name":"Brot } ] \" { [ \\","brand":"B\u00e4ckerei \"M\u00fcller\"","extra":{"a":[1,{"b":"]}"}]}},
          {"name":"\\\\","labels":["a","b\"c"]}
        ],"recipes":[]}
        """#
        let result = try scan(text)
        #expect(result.foods.count == 2)
        let first = try #require(JSONSerialization.jsonObject(with: result.foods[0]) as? [String: Any])
        #expect(first["name"] as? String == "Brot } ] \" { [ \\")
        #expect(first["brand"] as? String == "Bäckerei \"Müller\"")
        let second = try #require(JSONSerialization.jsonObject(with: result.foods[1]) as? [String: Any])
        #expect(second["name"] as? String == "\\\\")
        #expect(second["labels"] as? [String] == ["a", "b\"c"])
    }

    @Test("Nested objects and arrays in other top-level values are skipped, not mistaken for foods")
    func nestedOtherValues() throws {
        let text = #"""
        {"meta":{"foods":[{"name":"decoy"}],"list":[[1,2],[3]]},"foods":[{"name":"Real"}],
         "format":"bissbilanz.food-package","formatVersion":1,"tail":[{"foods":[]}]}
        """#
        let result = try scan(text)
        #expect(try names(result.foods) == ["Real"])
        #expect(result.header.foodCount == 1)
    }

    @Test("Recipes are counted, not yielded")
    func recipesAreCounted() throws {
        let text = #"""
        {"format":"bissbilanz.food-package","formatVersion":1,"foods":[{"name":"A"}],
         "recipes":[{"ref":"r1","ingredients":[{"food":"f1"}]},{"ref":"r2","ingredients":[]}]}
        """#
        let result = try scan(text)
        #expect(result.header.recipeCount == 2)
        #expect(result.foods.count == 1)
    }

    @Test("The same result however the bytes are cut into chunks")
    func chunkBoundaries() throws {
        let text = #"{"formatVersion":1,"foods":[{"name":"Käse \"Alp\" }"},{"name":"B","n":-12.5e3}],"format":"bissbilanz.food-package","exportedAt":"x"}"#
        let whole = try scan(text)
        for chunk in [1, 2, 3, 7, 11] {
            let pieces = try scan(text, chunk: chunk)
            #expect(pieces.foods == whole.foods)
            #expect(pieces.header == whole.header)
        }
        #expect(whole.header.exportedAt == "x")
    }

    @Test("A byte order mark at the start is skipped")
    func byteOrderMark() throws {
        var scanned: [Data] = []
        let scanner = ManifestScanner { scanned.append($0) }
        var bytes = Data([0xEF, 0xBB, 0xBF])
        bytes.append(Data(#"{"foods":[{"name":"A"}],"format":"bissbilanz.food-package","formatVersion":1}"#.utf8))
        try scanner.feed(bytes)
        try scanner.finish()
        #expect(scanned.count == 1)
    }

    @Test("Numbers, booleans and null at the top level are read, including right before a brace")
    func primitiveValues() throws {
        let result = try scan(#"{"formatVersion":1,"flag":true,"nothing":null,"foods":[],"format":"bissbilanz.food-package","n":2}"#)
        #expect(result.header.formatVersion == 1)
        #expect(result.header.foodCount == 0)
        try result.header.validate()
    }

    @Test("A food that is not an object, or a manifest that is not an object, is not a package")
    func malformedStructure() {
        #expect(throws: FoodPackageError.notAPackage) { try scan(#"{"foods":[1]}"#) }
        #expect(throws: FoodPackageError.notAPackage) { try scan(#"{"foods":["x"]}"#) }
        #expect(throws: FoodPackageError.notAPackage) { try scan(#"{"foods":[[1]]}"#) }
        #expect(throws: FoodPackageError.notAPackage) { try scan("[1]") }
        #expect(throws: FoodPackageError.notAPackage) { try scan("") }
        #expect(throws: FoodPackageError.notAPackage) { try scan(#"{"foods":[{"name":"A"}"#) }
    }

    @Test("A foods value that is not an array is reported by the header")
    func foodsNotAnArray() throws {
        let result = try scan(#"{"format":"bissbilanz.food-package","formatVersion":1,"foods":{"a":1}}"#)
        #expect(result.header.foodsNotAnArray)
        #expect(throws: FoodPackageError.invalid("foods — expected an array")) { try result.header.validate() }
    }

    @Test("Header validation tells a package from an account export and a newer format")
    func headerValidation() throws {
        let account = try scan(#"{"formatVersion":1,"foods":[]}"#)
        #expect(throws: FoodPackageError.accountExport) { try account.header.validate() }
        let foreign = try scan(#"{"format":"something-else","formatVersion":1,"foods":[]}"#)
        #expect(throws: FoodPackageError.notAPackage) { try foreign.header.validate() }
        let newer = try scan(#"{"format":"bissbilanz.food-package","formatVersion":99,"foods":[]}"#)
        #expect(throws: FoodPackageError.newerVersion) { try newer.header.validate() }
        let fractional = try scan(#"{"format":"bissbilanz.food-package","formatVersion":1.5,"foods":[]}"#)
        #expect(throws: FoodPackageError.invalid("formatVersion — expected an integer of at least 1")) {
            try fractional.header.validate()
        }
        let noFoods = try scan(#"{"format":"bissbilanz.food-package","formatVersion":1}"#)
        #expect(throws: FoodPackageError.invalid("foods — expected an array")) { try noFoods.header.validate() }
    }

    @Test("A food over the element cap reaches the receiver empty, so it fails to decode instead of being buffered")
    func oversizedElement() throws {
        let huge = String(repeating: "x", count: 300 * 1024)
        let result = try scan(#"{"format":"bissbilanz.food-package","formatVersion":1,"foods":[{"name":"\#(huge)"},{"name":"B"}]}"#)
        #expect(result.foods.count == 2)
        #expect(result.foods[0].isEmpty)
        #expect(try names([result.foods[1]]) == ["B"])
    }
}

@Suite("Bulk package")
@MainActor
struct BulkPackageTests {
    private func foods(_ range: ClosedRange<Int>) -> [[String: Any]] {
        range.map { BulkPackageFixtures.food($0) }
    }

    @Test("A package within the ordinary limits takes the ordinary flow")
    func smallPackageIsNormal() throws {
        let url = try BulkPackageFixtures.writePackage(manifest: BulkPackageFixtures.manifest(foods: foods(1 ... 5)))
        defer { BulkPackageFixtures.remove(url) }
        #expect(try BulkPackageProbe.assess(fileURL: url) == .normal)
    }

    @Test("More foods than one package may carry takes the bulk flow, with the counts")
    func manyFoodsIsBulk() throws {
        let count = FoodPackageFormat.maxFoods + 1
        let manifest = try BulkPackageFixtures.manifest(
            foods: foods(1 ... count), recipes: [["ref": "r1", "name": "R", "totalServings": 1, "ingredients": []]]
        )
        let url = try BulkPackageFixtures.writePackage(
            manifest: manifest, images: ["images/f1.webp": BulkPackageFixtures.webP]
        )
        defer { BulkPackageFixtures.remove(url) }
        guard case let .bulk(info) = try BulkPackageProbe.assess(fileURL: url) else {
            Issue.record("expected the bulk flow")
            return
        }
        #expect(info.foodCount == count)
        #expect(info.recipeCount == 1)
        #expect(info.imageCount == 1)
    }

    @Test("A file that is not a zip stays on the ordinary flow, to be worded there")
    func notAZipIsNormal() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("bulk-\(UUID().uuidString).json")
        try Data("{}".utf8).write(to: url)
        defer { BulkPackageFixtures.remove(url) }
        #expect(try BulkPackageProbe.assess(fileURL: url) == .normal)
    }

    @Test("Opening reads the manifest out of a folder, and an account export is recognised")
    func openLocatesManifest() throws {
        var writer = ZipWriter()
        try writer.add(
            name: "pack/\(FoodPackageFormat.manifestName)",
            data: BulkPackageFixtures.manifest(foods: foods(1 ... 2)), compress: true
        )
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("bulk-\(UUID().uuidString).zip")
        try writer.finish().write(to: url)
        defer { BulkPackageFixtures.remove(url) }
        let package = try BulkPackage.open(fileURL: url)
        #expect(package.root == "pack/")
        var seen = 0
        let header = try package.scan { _ in seen += 1 }
        #expect(seen == 2)
        #expect(header.foodCount == 2)

        var account = ZipWriter()
        try account.add(name: "bissbilanz.json", data: Data("{}".utf8), compress: false)
        let accountURL = FileManager.default.temporaryDirectory.appendingPathComponent("bulk-\(UUID().uuidString).zip")
        try account.finish().write(to: accountURL)
        defer { BulkPackageFixtures.remove(accountURL) }
        #expect(throws: FoodPackageError.accountExport) { try BulkPackage.open(fileURL: accountURL) }
    }

    // MARK: - Importer

    private func runImport(
        _ url: URL,
        container: ModelContainer,
        destination: BulkImportDestination = .local,
        expected: Int,
        recorder: BulkImageRecorder = BulkImageRecorder(),
        progress: BulkProgressLog = BulkProgressLog()
    ) async throws -> BulkImportSummary {
        try await BulkPackageImporter(modelContainer: container).run(
            fileURL: url, expectedFoods: expected, destination: destination,
            writeImage: recorder.writer, progress: { progress.record($0) }
        )
    }

    private func localFoods(_ container: ModelContainer) throws -> [LocalFood] {
        try container.mainContext.fetch(FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)]))
    }

    @Test("Imports every new food with lowercase ids and labels, and no upload jobs in Local mode")
    func importsLocalFoods() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let url = try BulkPackageFixtures.writePackage(manifest: BulkPackageFixtures.manifest(foods: foods(1 ... 12)))
        defer { BulkPackageFixtures.remove(url) }

        let summary = try await runImport(url, container: container, expected: 12)

        #expect(summary.created == 12)
        #expect(summary.skipped == 0)
        #expect(summary.invalid == 0)
        let rows = try localFoods(container)
        #expect(rows.count == 12)
        for row in rows {
            #expect(row.id == row.id.lowercased())
            #expect(UUID(uuidString: row.id) != nil)
            #expect(row.labels == ["snack"])
        }
        #expect(try container.mainContext.fetchCount(FetchDescriptor<BulkUploadJob>()) == 0)
    }

    @Test("Skips foods the store already has by name and brand or by barcode, and repeats inside the package")
    func skipsExistingFoods() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let existing = try JSONPatch.decode(Food.self, from: [
            "id": "11111111-1111-4111-8111-111111111111", "userId": "u", "name": "Haferflocken", "brand": "Bio",
            "servingSize": 100, "servingUnit": "g", "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1,
            "isFavorite": false, "barcode": "7612345678900",
        ])
        container.mainContext.insert(LocalFood(food: existing))
        try container.mainContext.save()

        let manifest = try BulkPackageFixtures.manifest(foods: [
            BulkPackageFixtures.food(1, name: "  HAFERFLOCKEN ", brand: "bio"),
            BulkPackageFixtures.food(2, name: "Other name", barcode: "7612345678900"),
            BulkPackageFixtures.food(3, name: "Reis"),
            BulkPackageFixtures.food(4, name: "reis"),
            BulkPackageFixtures.food(5, name: "Reis", brand: "Uncle"),
            BulkPackageFixtures.food(6, name: "Quark", barcode: "4000000000001"),
            BulkPackageFixtures.food(7, name: "Skyr", barcode: "4000000000001"),
        ])
        let url = try BulkPackageFixtures.writePackage(manifest: manifest)
        defer { BulkPackageFixtures.remove(url) }

        let summary = try await runImport(url, container: container, expected: 7)

        #expect(summary.created == 3)
        #expect(summary.skipped == 4)
        #expect(try localFoods(container).map(\.name).sorted() == ["Haferflocken", "Quark", "Reis", "Reis"])
    }

    @Test("Running the same import again skips everything it already added")
    func importIsResumable() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let url = try BulkPackageFixtures.writePackage(manifest: BulkPackageFixtures.manifest(foods: foods(1 ... 30)))
        defer { BulkPackageFixtures.remove(url) }

        let first = try await runImport(url, container: container, expected: 30)
        let second = try await runImport(url, container: container, expected: 30)

        #expect(first.created == 30)
        #expect(second.created == 0)
        #expect(second.skipped == 30)
        #expect(try localFoods(container).count == 30)
    }

    @Test("Counts foods that fail validation and says why, without stopping")
    func countsInvalidFoods() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        var broken = BulkPackageFixtures.food(2)
        broken["servingSize"] = 0
        var noName = BulkPackageFixtures.food(3)
        noName["name"] = "   "
        let manifest = try BulkPackageFixtures.manifest(foods: [
            BulkPackageFixtures.food(1), broken, noName, BulkPackageFixtures.food(4),
        ])
        let url = try BulkPackageFixtures.writePackage(manifest: manifest)
        defer { BulkPackageFixtures.remove(url) }

        let summary = try await runImport(url, container: container, expected: 4)

        #expect(summary.created == 2)
        #expect(summary.invalid == 2)
        #expect(summary.issues.count == 2)
        #expect(summary.issues[0].hasPrefix("foods.1.servingSize"))
        #expect(summary.issues[1].hasPrefix("foods.2.name"))
    }

    @Test("Stores photos as they are, named for the food, and counts the ones it cannot")
    func storesPhotos() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let manifest = try BulkPackageFixtures.manifest(foods: [
            BulkPackageFixtures.food(1, image: true),
            BulkPackageFixtures.food(2, image: true),
            BulkPackageFixtures.food(3),
        ])
        // Photo 2 is no image at all; photo 1 is a real WebP.
        let url = try BulkPackageFixtures.writePackage(manifest: manifest, images: [
            "images/f1.webp": BulkPackageFixtures.webP,
            "images/f2.webp": Data("not an image".utf8),
        ])
        defer { BulkPackageFixtures.remove(url) }
        let recorder = BulkImageRecorder()

        let summary = try await runImport(url, container: container, expected: 3, recorder: recorder)

        #expect(summary.created == 3)
        #expect(summary.images == 1)
        #expect(summary.imagesFailed == 1)
        let rows = try localFoods(container)
        let food = try #require(rows.first { $0.name == "Food 1" }?.toFood())
        let stored = try #require(recorder.filenames.first)
        #expect(recorder.filenames.count == 1)
        #expect(stored == "local-\(food.id).webp")
        #expect(food.imageUrl == "file:///memory/\(stored)")
        #expect(recorder.data(stored) == BulkPackageFixtures.webP)
        #expect(rows.first { $0.name == "Food 2" }?.toFood()?.imageUrl == nil)
    }

    @Test("In Synced mode every new food also gets an upload job for the importing account")
    func queuesUploadJobs() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let url = try BulkPackageFixtures.writePackage(manifest: BulkPackageFixtures.manifest(foods: foods(1 ... 8)))
        defer { BulkPackageFixtures.remove(url) }

        let summary = try await runImport(
            url, container: container, destination: .synced(userId: "user-1"), expected: 8
        )

        #expect(summary.created == 8)
        let jobs = try container.mainContext.fetch(FetchDescriptor<BulkUploadJob>())
        #expect(jobs.count == 8)
        #expect(Set(jobs.map(\.userId)) == ["user-1"])
        #expect(Set(jobs.map(\.state)) == [BulkUploadJob.pendingState])
        #expect(try Set(jobs.map(\.foodId)) == Set(localFoods(container).map(\.id)))
    }

    @Test("Writes in batches and reports progress after each, ending on the full count")
    func reportsProgressPerBatch() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let count = FoodPackageFormat.bulkBatchSize * 2 + 100
        let url = try BulkPackageFixtures.writePackage(manifest: BulkPackageFixtures.manifest(foods: foods(1 ... count)))
        defer { BulkPackageFixtures.remove(url) }
        let progress = BulkProgressLog()

        let summary = try await runImport(url, container: container, expected: count, progress: progress)

        #expect(summary.created == count)
        let seen = progress.all
        #expect(seen.count >= 3)
        #expect(seen.first?.processed == FoodPackageFormat.bulkBatchSize)
        #expect(seen.last == BulkImportProgress(processed: count, total: count))
        #expect(zip(seen, seen.dropFirst()).allSatisfy { $0.processed <= $1.processed })
        #expect(try container.mainContext.fetchCount(FetchDescriptor<LocalFood>()) == count)
    }

    @Test("Reports the recipes it leaves out")
    func reportsIgnoredRecipes() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let recipe: [String: Any] = ["ref": "r1", "name": "R", "totalServings": 1, "ingredients": []]
        let manifest = try BulkPackageFixtures.manifest(foods: foods(1 ... 2), recipes: [recipe, recipe])
        let url = try BulkPackageFixtures.writePackage(manifest: manifest)
        defer { BulkPackageFixtures.remove(url) }

        let summary = try await runImport(url, container: container, expected: 2)

        #expect(summary.recipesIgnored == 2)
        #expect(try container.mainContext.fetchCount(FetchDescriptor<LocalRecipe>()) == 0)
    }

    @Test("A manifest that is not a food package imports nothing")
    func rejectsForeignManifest() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let manifest = try JSONSerialization.data(withJSONObject: ["format": "other", "formatVersion": 1, "foods": []])
        let url = try BulkPackageFixtures.writePackage(manifest: manifest)
        defer { BulkPackageFixtures.remove(url) }

        await #expect(throws: FoodPackageError.notAPackage) {
            try await runImport(url, container: container, expected: 0)
        }
        #expect(try container.mainContext.fetchCount(FetchDescriptor<LocalFood>()) == 0)
    }

    @Test("A cancelled import keeps what it had written and a rerun carries on")
    func cancellationKeepsProgress() async throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let count = FoodPackageFormat.bulkBatchSize + 100
        let url = try BulkPackageFixtures.writePackage(manifest: BulkPackageFixtures.manifest(foods: foods(1 ... count)))
        defer { BulkPackageFixtures.remove(url) }

        let importer = BulkPackageImporter(modelContainer: container)
        let progress = BulkProgressLog()
        let task = Task { @MainActor in
            try await importer.run(
                fileURL: url, expectedFoods: count, destination: .local,
                writeImage: BulkImageRecorder().writer, progress: { progress.record($0) }
            )
        }
        // Stop as soon as the first batch is saved.
        progress.onRecord { task.cancel() }
        await #expect(throws: CancellationError.self) { try await task.value }

        let kept = try container.mainContext.fetchCount(FetchDescriptor<LocalFood>())
        #expect(kept == FoodPackageFormat.bulkBatchSize)

        let rerun = try await runImport(url, container: container, expected: count)
        #expect(rerun.created == count - kept)
        #expect(rerun.skipped == kept)
        #expect(try container.mainContext.fetchCount(FetchDescriptor<LocalFood>()) == count)
    }
}
