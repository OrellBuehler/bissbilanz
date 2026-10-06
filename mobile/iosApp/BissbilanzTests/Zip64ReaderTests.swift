@testable import Bissbilanz
import Compression
import Foundation
import Testing

/// Builds zip64 archives byte by byte, the way `yazl` with `forceZip64Format` does: sizes and
/// the local header offset live in a zip64 extra field behind 0xFFFFFFFF markers, and the
/// archive ends with a zip64 end record, its locator and an ordinary end record full of markers.
struct Zip64Builder {
    struct Item {
        let name: String
        let data: Data
        let deflate: Bool
    }

    /// Which of the three fields move into the extra field (the rest stay in the 32-bit slots).
    var markUncompressed = true
    var markCompressed = true
    var markOffset = true
    var items: [Item] = []

    mutating func add(_ name: String, _ data: Data, deflate: Bool = false) {
        items.append(Item(name: name, data: data, deflate: deflate))
    }

    static func deflated(_ data: Data) -> Data {
        var output = Data(count: data.count + data.count / 8 + 1024)
        let capacity = output.count
        let written = output.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) -> Int in
            data.withUnsafeBytes { (source: UnsafeRawBufferPointer) -> Int in
                compression_encode_buffer(
                    destination.bindMemory(to: UInt8.self).baseAddress!, capacity,
                    source.bindMemory(to: UInt8.self).baseAddress!, data.count,
                    nil, COMPRESSION_ZLIB
                )
            }
        }
        output.removeSubrange(written ..< output.count)
        return output
    }

    func build() -> Data {
        var body = Data()
        var directory = Data()
        for item in items {
            let name = Data(item.name.utf8)
            let payload = item.deflate ? Self.deflated(item.data) : item.data
            let crc = CRC32.checksum(item.data)
            let offset = body.count

            var localExtra = Data()
            localExtra.le16(1)
            localExtra.le16(16)
            localExtra.le64(item.data.count)
            localExtra.le64(payload.count)
            body.le32(0x0403_4B50)
            body.le16(45)
            body.le16(0x0800)
            body.le16(item.deflate ? 8 : 0)
            body.le16(0)
            body.le16(0x21)
            body.le32(Int(crc))
            body.le32(0xFFFF_FFFF)
            body.le32(0xFFFF_FFFF)
            body.le16(name.count)
            body.le16(localExtra.count)
            body.append(name)
            body.append(localExtra)
            body.append(payload)

            var extra = Data()
            var fields = Data()
            if markUncompressed { fields.le64(item.data.count) }
            if markCompressed { fields.le64(payload.count) }
            if markOffset { fields.le64(offset) }
            extra.le16(1)
            extra.le16(fields.count)
            extra.append(fields)
            directory.le32(0x0201_4B50)
            directory.le16(45)
            directory.le16(45)
            directory.le16(0x0800)
            directory.le16(item.deflate ? 8 : 0)
            directory.le16(0)
            directory.le16(0x21)
            directory.le32(Int(crc))
            directory.le32(markCompressed ? 0xFFFF_FFFF : payload.count)
            directory.le32(markUncompressed ? 0xFFFF_FFFF : item.data.count)
            directory.le16(name.count)
            directory.le16(extra.count)
            directory.le16(0)
            directory.le16(0)
            directory.le16(0)
            directory.le32(0)
            directory.le32(markOffset ? 0xFFFF_FFFF : offset)
            directory.append(name)
            directory.append(extra)
        }

        var output = body
        let directoryOffset = output.count
        output.append(directory)
        let recordOffset = output.count
        output.le32(0x0606_4B50)
        output.le64(44)
        output.le16(45)
        output.le16(45)
        output.le32(0)
        output.le32(0)
        output.le64(items.count)
        output.le64(items.count)
        output.le64(directory.count)
        output.le64(directoryOffset)
        output.le32(0x0706_4B50)
        output.le32(0)
        output.le64(recordOffset)
        output.le32(1)
        output.le32(0x0605_4B50)
        output.le16(0)
        output.le16(0)
        output.le16(0xFFFF)
        output.le16(0xFFFF)
        output.le32(0xFFFF_FFFF)
        output.le32(0xFFFF_FFFF)
        output.le16(0)
        return output
    }
}

extension Data {
    mutating func le16(_ value: Int) {
        append(UInt8(truncatingIfNeeded: value))
        append(UInt8(truncatingIfNeeded: value >> 8))
    }

    mutating func le32(_ value: Int) {
        le16(value)
        le16(value >> 16)
    }

    mutating func le64(_ value: Int) {
        le32(value)
        le32(value >> 32)
    }
}

@Suite("Zip64 reader")
struct Zip64ReaderTests {
    private func text(_ line: String, times: Int) -> Data {
        Data(String(repeating: line, count: times).utf8)
    }

    @Test("Reads stored and deflated entries whose sizes and offsets sit in zip64 extra fields")
    func readsForcedZip64Entries() throws {
        let noise = Data((0 ..< 700).map { UInt8(truncatingIfNeeded: $0 &* 7) })
        let manifest = text("{\"name\":\"Hafer\"}\n", times: 300)
        var builder = Zip64Builder()
        builder.add("README.txt", Data("hello".utf8), deflate: true)
        builder.add("bissbilanz-foods.json", manifest, deflate: true)
        builder.add("images/f1.webp", noise)
        builder.add("empty", Data())
        let zip = try ZipReader(data: builder.build(), maxEntries: 100)

        #expect(zip.entries.map(\.name) == ["README.txt", "bissbilanz-foods.json", "images/f1.webp", "empty"])
        #expect(zip.entries[1].method == 8)
        #expect(zip.entries[1].uncompressedSize == manifest.count)
        #expect(zip.entries[1].compressedSize < manifest.count)
        #expect(try zip.contents(of: #require(zip.entry(named: "bissbilanz-foods.json")), limit: 1 << 20) == manifest)
        #expect(try zip.contents(of: #require(zip.entry(named: "images/f1.webp")), limit: 1 << 20) == noise)
        #expect(try zip.contents(of: #require(zip.entry(named: "README.txt")), limit: 1 << 20) == Data("hello".utf8))
        #expect(try zip.contents(of: #require(zip.entry(named: "empty")), limit: 1 << 20).isEmpty)
    }

    @Test("Only the fields marked 0xFFFFFFFF are read from the extra field")
    func readsPartiallyMarkedEntries() throws {
        let data = text("0123456789", times: 40)
        var builder = Zip64Builder()
        builder.markUncompressed = false
        builder.markCompressed = false
        builder.add("a.txt", data, deflate: true)
        builder.add("b.txt", data)
        let zip = try ZipReader(data: builder.build(), maxEntries: 10)
        #expect(try zip.contents(of: zip.entries[0], limit: 4096) == data)
        #expect(try zip.contents(of: zip.entries[1], limit: 4096) == data)

        var offsetOnly = Zip64Builder()
        offsetOnly.markUncompressed = false
        offsetOnly.markCompressed = false
        offsetOnly.markOffset = false
        offsetOnly.add("c.txt", data)
        let plain = try ZipReader(data: offsetOnly.build(), maxEntries: 10)
        #expect(try plain.contents(of: plain.entries[0], limit: 4096) == data)
    }

    @Test("An archive with more than 65,535 entries is read through its zip64 end record")
    func readsMoreEntriesThanTheOrdinaryEndRecordCanCount() throws {
        var builder = Zip64Builder()
        let count = 66000
        for index in 0 ..< count {
            builder.add("images/f\(index).webp", Data([UInt8(truncatingIfNeeded: index)]))
        }
        let zip = try ZipReader(data: builder.build(), maxEntries: count + 16)
        #expect(zip.entries.count == count)
        let last = try #require(zip.entry(named: "images/f65999.webp"))
        #expect(try zip.contents(of: last, limit: 16) == Data([UInt8(truncatingIfNeeded: 65999)]))
        #expect(zip.entry(named: "images/f66000.webp") == nil)
    }

    @Test("The entry limit applies to the zip64 count")
    func zip64CountIsLimited() {
        var builder = Zip64Builder()
        for index in 0 ..< 20 { builder.add("f\(index)", Data()) }
        #expect(throws: ZipError.tooManyEntries) { try ZipReader(data: builder.build(), maxEntries: 10) }
    }

    @Test("A zip64 locator pointing nowhere is a damaged archive")
    func brokenLocatorIsDamaged() {
        var builder = Zip64Builder()
        builder.add("a", Data("x".utf8))
        var bytes = builder.build()
        // The locator's record offset sits 8 bytes into the 20 bytes before the end record.
        let locator = bytes.count - 22 - 20
        for index in 0 ..< 8 { bytes[locator + 8 + index] = 0xFF }
        #expect(throws: ZipError.damaged) { try ZipReader(data: bytes, maxEntries: 10) }
    }

    @Test("Opening by file URL reads the same entries as opening the bytes")
    func mappedFileMatchesInMemory() throws {
        var builder = Zip64Builder()
        let manifest = text("{\"a\":1}\n", times: 500)
        builder.add("bissbilanz-foods.json", manifest, deflate: true)
        builder.add("images/f1.webp", Data([1, 2, 3]))
        let bytes = builder.build()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("zip64-\(UUID().uuidString).zip")
        try bytes.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let mapped = try ZipReader(fileURL: url, maxEntries: 10)
        let loaded = try ZipReader(data: bytes, maxEntries: 10)
        #expect(mapped.entries == loaded.entries)
        #expect(try mapped.contents(of: #require(mapped.entry(named: "bissbilanz-foods.json")), limit: 1 << 20) == manifest)
        #expect(try mapped.contents(of: #require(mapped.entry(named: "images/f1.webp")), limit: 16) == Data([1, 2, 3]))
    }

    @Test("A missing file throws instead of reading as an empty archive")
    func missingFileThrows() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("missing-\(UUID().uuidString).zip")
        #expect(throws: (any Error).self) { try ZipReader(fileURL: url, maxEntries: 10) }
    }

    // MARK: - Streaming

    private func streamed(_ zip: ZipReader, _ entry: ZipEntry, limit: Int = 1 << 24) throws -> (data: Data, chunks: Int) {
        var data = Data()
        var chunks = 0
        try zip.stream(entry, limit: limit) { chunk in
            data.append(chunk)
            chunks += 1
        }
        return (data, chunks)
    }

    @Test("A deflated entry streams out in chunks that add up to the whole")
    func streamsDeflatedEntry() throws {
        // Large enough to need more than one 256 KB output chunk.
        let big = text("{\"name\":\"Haferflocken 100 g\",\"calories\":372}\n", times: 30000)
        var builder = Zip64Builder()
        builder.add("bissbilanz-foods.json", big, deflate: true)
        let zip = try ZipReader(data: builder.build(), maxEntries: 10)
        let result = try streamed(zip, zip.entries[0])
        #expect(result.data == big)
        #expect(result.chunks > 1)
    }

    @Test("A stored entry streams out too")
    func streamsStoredEntry() throws {
        let data = Data((0 ..< 600_000).map { UInt8(truncatingIfNeeded: $0) })
        var builder = Zip64Builder()
        builder.add("blob", data)
        let zip = try ZipReader(data: builder.build(), maxEntries: 10)
        let result = try streamed(zip, zip.entries[0])
        #expect(result.data == data)
        #expect(result.chunks == 3)
    }

    @Test("An empty entry streams nothing")
    func streamsEmptyEntry() throws {
        var builder = Zip64Builder()
        builder.add("empty", Data(), deflate: true)
        let zip = try ZipReader(data: builder.build(), maxEntries: 10)
        #expect(try streamed(zip, zip.entries[0]).data.isEmpty)
    }

    @Test("A wrong CRC is reported once the last chunk is out")
    func streamChecksCRC() throws {
        var builder = Zip64Builder()
        builder.add("a", Data("hello hello hello hello".utf8), deflate: true)
        var bytes = builder.build()
        // Flip a bit of the first central directory record's CRC (offset 16 into the record).
        let record = try #require(bytes.range(of: Data([0x50, 0x4B, 0x01, 0x02])))
        bytes[record.lowerBound + 16] ^= 0x01
        let zip = try ZipReader(data: bytes, maxEntries: 10)
        #expect(throws: ZipError.checksumMismatch) { try zip.stream(zip.entries[0], limit: 1024) { _ in } }
    }

    @Test("An entry declared bigger than the limit is refused before anything streams")
    func streamHonoursLimit() throws {
        var builder = Zip64Builder()
        builder.add("a", Data(repeating: 0x41, count: 5000), deflate: true)
        let zip = try ZipReader(data: builder.build(), maxEntries: 10)
        #expect(throws: ZipError.entryTooLarge) { try zip.stream(zip.entries[0], limit: 100) { _ in } }
    }

    @Test("A deflate stream that inflates past its declared size is damaged")
    func streamRefusesOversizeInflation() throws {
        var builder = Zip64Builder()
        let data = Data(repeating: 0x41, count: 5000)
        builder.add("a", data, deflate: true)
        var bytes = builder.build()
        // Declare 100 bytes in the central directory record's extra field: the first value of
        // the zip64 field is the uncompressed size.
        let record = try #require(bytes.range(of: Data([0x50, 0x4B, 0x01, 0x02])))
        let extra = record.lowerBound + 46 + "a".utf8.count + 4
        bytes[extra] = 100
        for index in 1 ..< 8 { bytes[extra + index] = 0 }
        let zip = try ZipReader(data: bytes, maxEntries: 10)
        #expect(throws: ZipError.damaged) { try zip.stream(zip.entries[0], limit: 1 << 20) { _ in } }
    }
}
