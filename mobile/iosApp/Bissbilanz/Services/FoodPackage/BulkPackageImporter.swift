import Foundation
import SwiftData

/// Where a bulk import's foods end up. In Synced mode each one also gets a
/// `BulkUploadJob` for the account that imported it, so `BulkUploadManager` can
/// send it to the server in the background; in Local mode the store is the only copy.
enum BulkImportDestination: Sendable, Equatable {
    case local
    case synced(userId: String)
}

struct BulkImportProgress: Equatable, Sendable {
    var processed: Int
    var total: Int
}

/// Counts only: nobody reads a per-food report of a hundred thousand foods.
struct BulkImportSummary: Equatable, Sendable {
    var created = 0
    var skipped = 0
    var invalid = 0
    var images = 0
    var imagesFailed = 0
    var recipesIgnored = 0
    /// The first few problems, worded, so a bad package can be told from a bad food.
    var issues: [String] = []
}

/// Stores one photo and returns the image URL to put on its food, nil when it could not be
/// written. The name is derived from the food's id, so importing a package again after an
/// interruption overwrites a photo instead of leaving a second copy behind.
typealias BulkImageWriter = @Sendable (_ data: Data, _ filename: String) -> String?

/// Imports a package too big for the ordinary flow: tens of thousands of foods, each with a
/// photo, in a file of up to a few gigabytes. The foods are usable in the app as soon as each
/// batch is saved.
///
/// There is no preview. The package is mapped and its manifest streamed (`BulkPackage`), so
/// memory stays flat however large it is; foods the store already has — the same name and
/// brand, or the same barcode — are skipped, which also makes a second run over the same
/// file the way to resume an interrupted one. New foods are written in batches, each batch
/// in its own context on this actor's executor (never the main thread) and saved before the
/// next is built.
@ModelActor
actor BulkPackageImporter {
    private struct ExistingKeys {
        var names: Set<String> = []
        var barcodes: Set<String> = []
    }

    static let defaultImageWriter: BulkImageWriter = { data, filename in
        LocalImageStore.write(data, named: filename)?.absoluteString
    }

    /// Runs an import off the main actor: a `@ModelActor` runs on the executor it was created
    /// on, so it has to be created inside a detached task, not by the (main-actor) caller.
    static func importPackage(
        container: ModelContainer,
        fileURL: URL,
        expectedFoods: Int,
        destination: BulkImportDestination,
        writeImage: @escaping BulkImageWriter = BulkPackageImporter.defaultImageWriter,
        progress: @escaping @Sendable (BulkImportProgress) -> Void
    ) async throws -> BulkImportSummary {
        let task = Task.detached(priority: .userInitiated) {
            try await BulkPackageImporter(modelContainer: container).run(
                fileURL: fileURL, expectedFoods: expectedFoods, destination: destination,
                writeImage: writeImage, progress: progress
            )
        }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }

    func run(
        fileURL: URL,
        expectedFoods: Int,
        destination: BulkImportDestination,
        writeImage: BulkImageWriter,
        progress: @Sendable (BulkImportProgress) -> Void
    ) throws -> BulkImportSummary {
        let package = try BulkPackage.open(fileURL: fileURL)
        var keys = try existingKeys()
        var summary = BulkImportSummary()
        var batch: [Food] = []
        var processed = 0
        let stamp = DateFormatting.isoDateTimeString(from: Date())

        func note(_ issue: String) {
            if summary.issues.count < FoodPackageFormat.maxIssues { summary.issues.append(issue) }
        }

        func flush() throws {
            guard !batch.isEmpty else { return }
            try insert(batch, destination: destination)
            summary.created += batch.count
            batch.removeAll(keepingCapacity: true)
            progress(BulkImportProgress(processed: processed, total: max(expectedFoods, processed)))
        }

        func handle(_ element: Data) throws {
            try Task.checkCancellation()
            processed += 1
            let path = "foods.\(processed - 1)"
            let food: PackageFood
            do {
                let object = try JSONSerialization.jsonObject(with: element)
                food = try PackageManifestCoding.parseFood(object, path: path)
            } catch let error as FoodPackageError {
                summary.invalid += 1
                if case let .invalid(detail) = error { note(detail) }
                return
            } catch {
                summary.invalid += 1
                note("\(path) — not valid JSON")
                return
            }

            let key = FoodPackageText.foodKey(name: food.name, brand: food.brand)
            let barcode = FoodPackageText.trimBarcode(food.barcode)
            if keys.names.contains(key) || barcode.map({ keys.barcodes.contains($0) }) == true {
                summary.skipped += 1
                return
            }

            let id = UUID().uuidString.lowercased()
            var imageUrl = LocalFoodPackageService.publicImageUrl(food.imageUrl)
            if let imagePath = food.image {
                imageUrl = storeImage(imagePath, id: id, package: package, writeImage: writeImage, summary: &summary)
                    ?? imageUrl
            }
            do {
                batch.append(try LocalFoodPackageService.makeFood(
                    from: food, id: id, barcode: barcode, imageUrl: imageUrl, stamp: stamp
                ))
            } catch {
                summary.invalid += 1
                note("\(path) — \(error.localizedDescription)")
                return
            }
            keys.names.insert(key)
            if let barcode { keys.barcodes.insert(barcode) }
            if batch.count >= FoodPackageFormat.bulkBatchSize { try flush() }
        }

        let header: ManifestHeader
        do {
            header = try package.scan(onFood: handle)
        } catch is CancellationError {
            // What was read so far is kept: the next run skips it and carries on.
            try flush()
            throw CancellationError()
        }
        try flush()
        summary.recipesIgnored = header.recipeCount
        progress(BulkImportProgress(processed: processed, total: max(expectedFoods, processed)))
        return summary
    }

    /// The image URL of the stored photo; nil, with the failure counted, when the package
    /// has none at that path or it cannot be read.
    private func storeImage(
        _ path: String,
        id: String,
        package: BulkPackage,
        writeImage: BulkImageWriter,
        summary: inout BulkImportSummary
    ) -> String? {
        do {
            if let data = try package.image(at: path),
               let image = PackageImageCodec.importable(data),
               let url = writeImage(image.data, "local-\(id).\(image.ext)")
            {
                summary.images += 1
                return url
            }
        } catch {
            summary.imagesFailed += 1
            if summary.issues.count < FoodPackageFormat.maxIssues {
                summary.issues.append("\(path) — \(error.localizedDescription)")
            }
            return nil
        }
        summary.imagesFailed += 1
        return nil
    }

    /// Name and brand keys and barcodes of every food the store holds, read as just those
    /// columns — not the encoded food — so even a very large store is a few megabytes.
    private func existingKeys() throws -> ExistingKeys {
        var keys = ExistingKeys()
        let context = ModelContext(modelContainer)
        var descriptor = FetchDescriptor<LocalFood>()
        descriptor.propertiesToFetch = [\.name, \.brand, \.barcode]
        for row in try context.fetch(descriptor) {
            keys.names.insert(FoodPackageText.foodKey(name: row.name, brand: row.brand))
            if let barcode = FoodPackageText.trimBarcode(row.barcode) { keys.barcodes.insert(barcode) }
        }
        return keys
    }

    private func insert(_ foods: [Food], destination: BulkImportDestination) throws {
        try autoreleasepool {
            let context = ModelContext(modelContainer)
            context.autosaveEnabled = false
            for food in foods {
                context.insert(LocalFood(food: food))
                if case let .synced(userId) = destination {
                    context.insert(BulkUploadJob(userId: userId, foodId: food.id))
                }
            }
            try context.save()
        }
    }
}
