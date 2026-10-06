import Foundation

/// What the bulk import needs to know before it starts, read from the whole manifest.
struct BulkPackageInfo: Equatable, Sendable {
    let foodCount: Int
    let recipeCount: Int
    let imageCount: Int
    let fileBytes: Int
}

enum BulkPackageRoute: Equatable, Sendable {
    case normal
    case bulk(BulkPackageInfo)
}

/// The top-level facts of a manifest, collected while its bytes stream past.
struct ManifestHeader: Equatable, Sendable {
    var format: String?
    var formatVersion: Double?
    var exportedAt: String?
    var foodCount = 0
    var recipeCount = 0
    var sawFoods = false
    var foodsNotAnArray = false

    /// The same checks `PackageManifestCoding.parse` makes of a whole manifest, in the
    /// same order, against the bulk limits. A manifest lists `format` wherever it likes,
    /// so this can only run once all of it has been read.
    func validate() throws {
        if format != FoodPackageFormat.format {
            if sawFoods, formatVersion != nil, format == nil {
                throw FoodPackageError.accountExport
            }
            throw FoodPackageError.notAPackage
        }
        if let formatVersion, formatVersion > Double(FoodPackageFormat.version) {
            throw FoodPackageError.newerVersion
        }
        guard let formatVersion, formatVersion == formatVersion.rounded(), formatVersion >= 1 else {
            throw FoodPackageError.invalid("formatVersion — expected an integer of at least 1")
        }
        guard sawFoods, !foodsNotAnArray else { throw FoodPackageError.invalid("foods — expected an array") }
        guard foodCount <= FoodPackageFormat.bulkMaxFoods else {
            throw FoodPackageError.invalid("foods — too many foods")
        }
    }
}

/// Reads a manifest as bytes arrive, without ever holding all of it: finds the top-level
/// `foods` array wherever it sits among the other keys and hands each element's bytes to
/// `onElement`, while the other top-level values (`format`, `formatVersion`, `exportedAt`)
/// are kept for the header and the `recipes` are only counted. Strings are tracked
/// through their escapes, so a brace or bracket inside one never moves the nesting depth.
///
/// A byte scanner, not a validator: a food that is not valid JSON, or not a valid food,
/// fails when whoever receives its bytes decodes it, and only that one food is lost.
final class ManifestScanner {
    private enum Capture {
        case none
        case topValue
        case element
    }

    private static let maxTopValueBytes = 64 * 1024
    private static let maxElementBytes = 256 * 1024

    private let onElement: (Data) throws -> Void
    private(set) var header = ManifestHeader()

    private var depth = 0
    private var rootClosed = false
    private var inString = false
    private var escaped = false
    private var readingKey = false
    private var expectingKey = false
    private var awaitingValue = false
    private var key: [UInt8] = []
    private var topKey = ""
    private var inFoods = false
    private var inRecipes = false
    private var capture = Capture.none
    private var primitiveOpen = false
    private var overflow = false
    private var buffer: [UInt8] = []
    private var fed = 0

    init(onElement: @escaping (Data) throws -> Void) {
        self.onElement = onElement
    }

    func feed(_ chunk: UnsafeBufferPointer<UInt8>) throws {
        var index = 0
        if fed == 0, chunk.count >= 3, chunk[0] == 0xEF, chunk[1] == 0xBB, chunk[2] == 0xBF {
            index = 3
        }
        fed += chunk.count
        while index < chunk.count {
            let byte = chunk[index]
            index += 1
            if inString {
                try stringByte(byte)
            } else {
                try structuralByte(byte)
            }
        }
    }

    func feed(_ data: Data) throws {
        try data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            try feed(raw.bindMemory(to: UInt8.self))
        }
    }

    func finish() throws {
        guard depth == 0, rootClosed, !inString else { throw FoodPackageError.notAPackage }
    }

    // MARK: Strings

    private func stringByte(_ byte: UInt8) throws {
        if capture != .none { appendCaptured(byte) }
        if escaped {
            escaped = false
            if readingKey { key.append(byte) }
            return
        }
        if byte == 0x5C {
            escaped = true
            if readingKey { key.append(byte) }
            return
        }
        if byte == 0x22 {
            inString = false
            if readingKey {
                readingKey = false
                topKey = String(decoding: key, as: UTF8.self)
                key.removeAll(keepingCapacity: true)
            } else if capture == .topValue, depth == 1 {
                try finishTopValue()
            }
            return
        }
        if readingKey { key.append(byte) }
    }

    // MARK: Structure

    private func structuralByte(_ byte: UInt8) throws {
        switch byte {
        case 0x20, 0x09, 0x0A, 0x0D:
            if capture == .topValue, primitiveOpen {
                try finishTopValue()
            } else if capture != .none {
                appendCaptured(byte)
            }
        case 0x22:
            try beginString()
        case 0x7B, 0x5B:
            try open(byte)
        case 0x7D, 0x5D:
            try close(byte)
        case 0x3A:
            if depth == 1 {
                guard !expectingKey, !awaitingValue else { throw FoodPackageError.notAPackage }
                awaitingValue = true
            } else if capture != .none {
                appendCaptured(byte)
            }
        case 0x2C:
            if depth == 1 {
                if capture == .topValue, primitiveOpen { try finishTopValue() }
                expectingKey = true
                awaitingValue = false
            } else if capture != .none {
                appendCaptured(byte)
            }
        default:
            try primitiveByte(byte)
        }
    }

    private func primitiveByte(_ byte: UInt8) throws {
        switch depth {
        case 0:
            throw FoodPackageError.notAPackage
        case 1:
            if capture == .topValue {
                appendCaptured(byte)
            } else {
                guard awaitingValue else { throw FoodPackageError.notAPackage }
                startTopValue(byte)
                primitiveOpen = true
            }
        default:
            if inFoods, depth == 2 { throw FoodPackageError.notAPackage }
            if capture != .none { appendCaptured(byte) }
        }
    }

    private func beginString() throws {
        switch depth {
        case 0:
            throw FoodPackageError.notAPackage
        case 1:
            if expectingKey {
                expectingKey = false
                readingKey = true
                key.removeAll(keepingCapacity: true)
            } else {
                guard awaitingValue else { throw FoodPackageError.notAPackage }
                startTopValue(0x22)
            }
        default:
            if inFoods, depth == 2 { throw FoodPackageError.notAPackage }
            if capture != .none { appendCaptured(0x22) }
        }
        inString = true
    }

    private func open(_ byte: UInt8) throws {
        if depth == 0 {
            guard byte == 0x7B, !rootClosed else { throw FoodPackageError.notAPackage }
            depth = 1
            expectingKey = true
            return
        }
        depth += 1
        if depth == 2 {
            guard awaitingValue else { throw FoodPackageError.notAPackage }
            if byte == 0x5B, topKey == "foods" {
                guard !header.sawFoods else { throw FoodPackageError.invalid("foods — duplicate key") }
                header.sawFoods = true
                inFoods = true
                awaitingValue = false
                return
            }
            if byte == 0x5B, topKey == "recipes" {
                inRecipes = true
                awaitingValue = false
                return
            }
            startTopValue(byte)
            return
        }
        if inFoods, depth == 3 {
            guard byte == 0x7B else { throw FoodPackageError.notAPackage }
            capture = .element
            overflow = false
            buffer.removeAll(keepingCapacity: true)
            buffer.append(byte)
            return
        }
        if inRecipes, depth == 3 {
            header.recipeCount += 1
            return
        }
        if capture != .none { appendCaptured(byte) }
    }

    private func close(_ byte: UInt8) throws {
        guard depth > 0 else { throw FoodPackageError.notAPackage }
        if depth == 1, capture == .topValue, primitiveOpen { try finishTopValue() }
        if capture != .none { appendCaptured(byte) }
        depth -= 1
        switch depth {
        case 0:
            rootClosed = true
        case 1:
            if inFoods {
                inFoods = false
            } else if inRecipes {
                inRecipes = false
            } else if capture == .topValue {
                try finishTopValue()
            }
        case 2:
            if inFoods, capture == .element { try emitElement() }
        default:
            break
        }
    }

    // MARK: Captured values

    private func startTopValue(_ first: UInt8) {
        capture = .topValue
        primitiveOpen = false
        overflow = false
        awaitingValue = false
        buffer.removeAll(keepingCapacity: true)
        buffer.append(first)
    }

    private func appendCaptured(_ byte: UInt8) {
        guard !overflow else { return }
        let limit = capture == .element ? Self.maxElementBytes : Self.maxTopValueBytes
        if buffer.count >= limit {
            overflow = true
            buffer.removeAll(keepingCapacity: true)
        } else {
            buffer.append(byte)
        }
    }

    private func emitElement() throws {
        let element = overflow ? Data() : Data(buffer)
        capture = .none
        overflow = false
        buffer.removeAll(keepingCapacity: true)
        header.foodCount += 1
        try onElement(element)
    }

    private func finishTopValue() throws {
        let value = overflow ? nil : Data(buffer)
        capture = .none
        primitiveOpen = false
        overflow = false
        buffer.removeAll(keepingCapacity: true)
        if topKey == "foods" || topKey == "recipes" {
            if topKey == "foods" {
                header.sawFoods = true
                header.foodsNotAnArray = true
            }
            return
        }
        guard topKey == "format" || topKey == "formatVersion" || topKey == "exportedAt" else { return }
        guard let value else { throw FoodPackageError.notAPackage }
        let parsed: Any
        do {
            parsed = try JSONSerialization.jsonObject(with: value, options: [.fragmentsAllowed])
        } catch {
            throw FoodPackageError.invalid("\(topKey) — \(error.localizedDescription)")
        }
        switch topKey {
        case "format":
            header.format = parsed as? String
        case "formatVersion":
            header.formatVersion = PackageManifestCoding.number(parsed)
        default:
            header.exportedAt = parsed as? String
        }
    }
}

/// A package opened for the bulk import: the zip mapped, never read whole, and its manifest
/// located. Everything that touches the file goes through here.
struct BulkPackage: Sendable {
    let reader: ZipReader
    let manifest: ZipEntry
    let root: String
    let fileBytes: Int

    static func open(fileURL: URL) throws -> BulkPackage {
        let size = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0 else { throw FoodPackageError.empty }
        guard size <= FoodPackageFormat.bulkMaxBytes else { throw FoodPackageError.tooLarge }

        let reader: ZipReader
        do {
            reader = try ZipReader(fileURL: fileURL, maxEntries: FoodPackageFormat.bulkMaxZipEntries)
        } catch let error as ZipError {
            throw map(error)
        }

        var manifest: ZipEntry?
        var root = ""
        var accountExport = false
        for entry in reader.entries {
            if manifest == nil, let prefix = FoodPackageReader.manifestPrefix(entry.name),
               entry.uncompressedSize <= FoodPackageFormat.bulkMaxManifestBytes
            {
                manifest = entry
                root = prefix
            } else if entry.name.hasSuffix("bissbilanz.json") {
                accountExport = true
            }
        }
        guard let manifest else {
            throw accountExport ? FoodPackageError.accountExport : FoodPackageError.missingManifest
        }
        return BulkPackage(reader: reader, manifest: manifest, root: root, fileBytes: size)
    }

    static func map(_ error: ZipError) -> FoodPackageError {
        switch error {
        case .notAZip: .notAPackage
        case .tooManyEntries: .tooManyFiles
        case .entryTooLarge: .tooLarge
        case .damaged, .unsupported, .checksumMismatch: .damaged
        }
    }

    /// Streams the manifest through a scanner, giving each food's bytes to `onFood`. The
    /// header it returns has been validated; a manifest too damaged to finish throws.
    @discardableResult
    func scan(onFood: (Data) throws -> Void) throws -> ManifestHeader {
        try withoutActuallyEscaping(onFood) { escapable in
            let scanner = ManifestScanner(onElement: escapable)
            do {
                try reader.stream(manifest, limit: FoodPackageFormat.bulkMaxManifestBytes) { chunk in
                    try scanner.feed(chunk)
                }
            } catch let error as ZipError {
                throw Self.map(error)
            }
            try scanner.finish()
            try scanner.header.validate()
            return scanner.header
        }
    }

    /// The photo at a manifest image path, nil when the package has no such entry.
    func image(at path: String) throws -> Data? {
        guard PackageManifestCoding.isImagePath(path), let entry = reader.entry(named: root + path) else {
            return nil
        }
        do {
            return try reader.contents(of: entry, limit: FoodPackageFormat.maxImageEntryBytes)
        } catch let error as ZipError {
            throw Self.map(error)
        }
    }

    var imageCount: Int {
        let prefix = root + "images/"
        return reader.entries.reduce(0) { $0 + ($1.name.hasPrefix(prefix) && !$1.isDirectory ? 1 : 0) }
    }
}

enum BulkPackageProbe {
    /// Decides how a package is imported: the ordinary preview-and-resolve flow, or the bulk
    /// one for what that flow turns away — a file past the package limit, a manifest past the
    /// manifest limit, or more foods than one package may carry. A file that is not a zip, or
    /// whose trouble is for the ordinary flow to word, stays on the ordinary flow unless it is
    /// too big for it anyway.
    static func assess(fileURL: URL) throws -> BulkPackageRoute {
        let size = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= FoodPackageFormat.bulkMaxBytes else { throw FoodPackageError.tooLarge }
        guard try startsLikeZip(fileURL) else {
            if size > FoodPackageFormat.maxPackageBytes { throw FoodPackageError.notAPackage }
            return .normal
        }

        let package: BulkPackage
        do {
            package = try BulkPackage.open(fileURL: fileURL)
        } catch where size <= FoodPackageFormat.maxPackageBytes {
            ErrorReporter.addBreadcrumb("bulk probe left the file to the ordinary flow: \(error)", category: "food-package")
            return .normal
        }
        let oversized = size > FoodPackageFormat.maxPackageBytes
            || package.manifest.uncompressedSize > FoodPackageFormat.maxManifestBytes
        guard !oversized else { return try .bulk(info(package, package.scan { _ in })) }
        let counted: ManifestHeader
        do {
            counted = try package.scan { _ in }
        } catch {
            // Whatever is wrong with a package the ordinary limits accept is for the
            // ordinary flow to word.
            ErrorReporter.addBreadcrumb("bulk probe left the file to the ordinary flow: \(error)", category: "food-package")
            return .normal
        }
        return counted.foodCount > FoodPackageFormat.maxFoods ? .bulk(info(package, counted)) : .normal
    }

    private static func info(_ package: BulkPackage, _ header: ManifestHeader) -> BulkPackageInfo {
        BulkPackageInfo(
            foodCount: header.foodCount,
            recipeCount: header.recipeCount,
            imageCount: package.imageCount,
            fileBytes: package.fileBytes
        )
    }

    private static func startsLikeZip(_ url: URL) throws -> Bool {
        let handle = try FileHandle(forReadingFrom: url)
        let head = try handle.read(upToCount: 3)
        try handle.close()
        guard let head else { return false }
        return FoodPackageReader.isZip(head)
    }
}
