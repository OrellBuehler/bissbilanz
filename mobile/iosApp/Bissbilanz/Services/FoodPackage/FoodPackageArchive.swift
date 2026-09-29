import CryptoKit
import Foundation

/// An opened food package: its validated manifest plus lazy access to the photos.
/// Port of `readFoodPackage` in `src/lib/server/food-package/archive.ts`.
struct FoodPackageFile {
    let manifest: PackageManifest
    /// SHA-256 of the file's bytes; ties an import to the file its preview was made from.
    let packageHash: String
    private let reader: ZipReader?
    private let root: String

    fileprivate init(manifest: PackageManifest, packageHash: String, reader: ZipReader?, root: String) {
        self.manifest = manifest
        self.packageHash = packageHash
        self.reader = reader
        self.root = root
    }

    /// Inflates just the named manifest image paths. Missing, oversized or damaged
    /// entries are absent from the result, as are paths that are not image paths.
    func readImages(_ paths: [String]) -> [String: Data] {
        guard let reader else { return [:] }
        var wanted = Set<String>()
        for path in paths where PackageManifestCoding.isImagePath(path) {
            wanted.insert(root + path)
        }
        var images: [String: Data] = [:]
        var total = 0
        for entry in reader.entries where wanted.contains(entry.name) {
            guard images[String(entry.name.dropFirst(root.count))] == nil,
                  entry.uncompressedSize <= FoodPackageFormat.maxImageEntryBytes,
                  total + entry.uncompressedSize <= FoodPackageFormat.maxTotalInflatedBytes,
                  let content = try? reader.contents(of: entry, limit: FoodPackageFormat.maxImageEntryBytes)
            else { continue }
            total += entry.uncompressedSize
            images[String(entry.name.dropFirst(root.count))] = content
        }
        return images
    }
}

enum FoodPackageReader {
    /// Opens package bytes without trusting any of their sizes: only the manifest
    /// is inflated up front, and only below its cap; photos are inflated later,
    /// and only those the manifest names.
    static func read(_ data: Data) throws -> FoodPackageFile {
        guard !data.isEmpty else { throw FoodPackageError.empty }
        guard data.count <= FoodPackageFormat.maxPackageBytes else { throw FoodPackageError.tooLarge }
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()

        guard isZip(data) else {
            guard data.count <= FoodPackageFormat.maxManifestBytes else { throw FoodPackageError.notAPackage }
            return FoodPackageFile(
                manifest: try PackageManifestCoding.parse(data), packageHash: hash, reader: nil, root: ""
            )
        }

        let reader: ZipReader
        do {
            reader = try ZipReader(data: data, maxEntries: FoodPackageFormat.maxZipEntries)
        } catch let zipError as ZipError {
            throw zipError == .tooManyEntries ? FoodPackageError.tooManyFiles : FoodPackageError.damaged
        }

        var manifestEntry: ZipEntry?
        var root = ""
        var accountExport = false
        for entry in reader.entries {
            if manifestEntry == nil, let prefix = manifestPrefix(entry.name),
               entry.uncompressedSize <= FoodPackageFormat.maxManifestBytes
            {
                manifestEntry = entry
                root = prefix
            } else if entry.name.hasSuffix("bissbilanz.json") {
                accountExport = true
            }
        }
        guard let manifestEntry else {
            throw accountExport ? FoodPackageError.accountExport : FoodPackageError.missingManifest
        }
        guard let manifestData = try? reader.contents(of: manifestEntry, limit: FoodPackageFormat.maxManifestBytes) else {
            throw FoodPackageError.damaged
        }
        return FoodPackageFile(
            manifest: try PackageManifestCoding.parse(manifestData), packageHash: hash, reader: reader, root: root
        )
    }

    static func isZip(_ data: Data) -> Bool {
        guard data.count >= 3 else { return false }
        let start = data.startIndex
        return data[start] == 0x50 && data[start + 1] == 0x4B && (data[start + 2] == 0x03 || data[start + 2] == 0x05)
    }

    /// The manifest at the root, or inside one top-level folder (re-zipped by a file manager).
    private static func manifestPrefix(_ name: String) -> String? {
        if name == FoodPackageFormat.manifestName { return "" }
        let suffix = "/" + FoodPackageFormat.manifestName
        guard name.hasSuffix(suffix) else { return nil }
        let folder = name.dropLast(suffix.count)
        return folder.isEmpty || folder.contains("/") ? nil : String(folder) + "/"
    }
}
