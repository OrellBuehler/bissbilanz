@testable import Bissbilanz
import Foundation
import Testing

@Suite("Zip archive")
struct ZipArchiveTests {
    /// Made with Python's `zipfile`: a deflated entry, a stored one in a folder and an empty one.
    private static let pythonZip = Data(base64Encoded:
        "UEsDBBQAAAAIAABQOl3CI9i0GQAAAGgBAAAJAAAAaGVsbG8udHh080jNyclXcMosLk7KzEnMq1JU8BgVoYEIAFBLAwQUAAAAAAAAUDpdjM4OEEAAAABAAAAADAAAAGRhdGEvcmF3LmJpbgABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj9QSwMEFAAAAAAAAFA6XQAAAAAAAAAAAAAAAAkAAABlbXB0eS50eHRQSwECFAMUAAAACAAAUDpdwiPYtBkAAABoAQAACQAAAAAAAAAAAAAAgAEAAAAAaGVsbG8udHh0UEsBAhQDFAAAAAAAAFA6XYzODhBAAAAAQAAAAAwAAAAAAAAAAAAAAIABQAAAAGRhdGEvcmF3LmJpblBLAQIUAxQAAAAAAABQOl0AAAAAAAAAAAAAAAAJAAAAAAAAAAAAAACAAaoAAABlbXB0eS50eHRQSwUGAAAAAAMAAwCoAAAA0QAAAAAA"
    )!

    private func reader(_ data: Data, maxEntries: Int = 100) throws -> ZipReader {
        try ZipReader(data: data, maxEntries: maxEntries)
    }

    private func repetitive(_ text: String, times: Int) -> Data {
        Data(String(repeating: text, count: times).utf8)
    }

    // MARK: - CRC

    @Test("CRC-32 of the standard check string")
    func crcCheckValue() {
        #expect(CRC32.checksum(Data("123456789".utf8)) == 0xCBF4_3926)
        #expect(CRC32.checksum(Data()) == 0)
    }

    // MARK: - Reading archives from other writers

    @Test("Reads the deflated, stored and empty entries of a zip made by another tool")
    func readsPythonZip() throws {
        let zip = try reader(Self.pythonZip)
        #expect(zip.entries.map(\.name) == ["hello.txt", "data/raw.bin", "empty.txt"])
        #expect(zip.entries[0].method == 8)
        #expect(zip.entries[1].method == 0)

        let hello = try zip.contents(of: #require(zip.entry(named: "hello.txt")), limit: 1024)
        #expect(hello == repetitive("Hello Bissbilanz! ", times: 20))
        let raw = try zip.contents(of: #require(zip.entry(named: "data/raw.bin")), limit: 1024)
        #expect(raw == Data(0 ..< 64))
        let empty = try zip.contents(of: #require(zip.entry(named: "empty.txt")), limit: 1024)
        #expect(empty.isEmpty)
    }

    // MARK: - Writing

    @Test("A written archive reads back: deflated, stored, empty and non-ASCII names")
    func roundTrip() throws {
        let text = repetitive("Haferflocken 100 g\n", times: 200)
        let noise = Data((0 ..< 300).map { UInt8(truncatingIfNeeded: $0 &* 73 &+ 11) })
        var writer = ZipWriter(date: Date(timeIntervalSince1970: 1_790_000_000))
        try writer.add(name: "bissbilanz-foods.json", data: text, compress: true)
        try writer.add(name: "images/f1.webp", data: noise, compress: false)
        try writer.add(name: "Käse/Größe.txt", data: Data("ü".utf8), compress: true)
        try writer.add(name: "empty", data: Data(), compress: true)
        let zip = try reader(writer.finish())

        #expect(zip.entries.map(\.name) == ["bissbilanz-foods.json", "images/f1.webp", "Käse/Größe.txt", "empty"])
        #expect(zip.entries[0].method == 8)
        #expect(zip.entries[0].compressedSize < text.count)
        #expect(zip.entries[1].method == 0)
        #expect(try zip.contents(of: zip.entries[0], limit: 1 << 20) == text)
        #expect(try zip.contents(of: zip.entries[1], limit: 1 << 20) == noise)
        #expect(try zip.contents(of: zip.entries[2], limit: 1 << 20) == Data("ü".utf8))
        #expect(try zip.contents(of: zip.entries[3], limit: 1 << 20).isEmpty)
    }

    @Test("Entries that do not shrink are stored even when compression was asked for")
    func incompressibleIsStored() throws {
        let tiny = Data("x".utf8)
        var writer = ZipWriter()
        try writer.add(name: "tiny", data: tiny, compress: true)
        let zip = try reader(writer.finish())
        #expect(zip.entries[0].method == 0)
        #expect(try zip.contents(of: zip.entries[0], limit: 10) == tiny)
    }

    @Test("Writes the central directory a strict reader expects")
    func layout() throws {
        var writer = ZipWriter(date: Date(timeIntervalSince1970: 1_790_000_000))
        try writer.add(name: "a.txt", data: Data("hello".utf8), compress: false)
        let bytes = try [UInt8](writer.finish())
        // local header signature, version 20, UTF-8 name flag, no data descriptor
        #expect(Array(bytes[0 ..< 4]) == [0x50, 0x4B, 0x03, 0x04])
        #expect(bytes[4] == 20)
        #expect(bytes[6] == 0x00 && bytes[7] == 0x08)
        // end record: signature, one entry, empty comment, and it is the last thing in the file
        let end = bytes.count - 22
        #expect(Array(bytes[end ..< end + 4]) == [0x50, 0x4B, 0x05, 0x06])
        #expect(bytes[end + 10] == 1 && bytes[end + 8] == 1)
        #expect(bytes[end + 20] == 0 && bytes[end + 21] == 0)
        // the directory offset in the end record points at the central header signature
        let offset = Int(bytes[end + 16]) | Int(bytes[end + 17]) << 8
        #expect(Array(bytes[offset ..< offset + 4]) == [0x50, 0x4B, 0x01, 0x02])
    }

    // MARK: - Hostile or broken input

    @Test("Rejects data that is not a zip")
    func rejectsNonZip() {
        #expect(throws: ZipError.notAZip) { try reader(Data("definitely not a zip file, just text".utf8)) }
        #expect(throws: ZipError.notAZip) { try reader(Data([0x50, 0x4B])) }
    }

    @Test("Rejects an archive cut short")
    func rejectsTruncated() throws {
        var writer = ZipWriter()
        try writer.add(name: "a.txt", data: repetitive("abc", times: 50), compress: true)
        let bytes = try writer.finish()
        #expect(throws: ZipError.notAZip) { try reader(bytes.dropLast(10)) }
    }

    @Test("Rejects more entries than allowed before reading any")
    func rejectsTooManyEntries() throws {
        var writer = ZipWriter()
        for index in 0 ..< 5 {
            try writer.add(name: "f\(index)", data: Data("x".utf8), compress: false)
        }
        let bytes = try writer.finish()
        #expect(throws: ZipError.tooManyEntries) { try reader(bytes, maxEntries: 4) }
        #expect(try reader(bytes, maxEntries: 5).entries.count == 5)
    }

    @Test("Refuses entries larger than the limit and never inflates them")
    func rejectsOversizedEntry() throws {
        var writer = ZipWriter()
        try writer.add(name: "big", data: repetitive("0123456789", times: 1000), compress: true)
        let zip = try reader(writer.finish())
        #expect(throws: ZipError.entryTooLarge) { try zip.contents(of: zip.entries[0], limit: 9999) }
        #expect(try zip.contents(of: zip.entries[0], limit: 10000).count == 10000)
    }

    @Test("Detects a payload that was changed")
    func detectsCorruption() throws {
        var writer = ZipWriter()
        try writer.add(name: "a.txt", data: Data("hello world".utf8), compress: false)
        var bytes = try writer.finish()
        // The stored payload starts right after the 30-byte header and the name.
        let payload = 30 + "a.txt".utf8.count
        bytes[payload] ^= 0xFF
        let zip = try reader(bytes)
        #expect(throws: ZipError.checksumMismatch) { try zip.contents(of: zip.entries[0], limit: 100) }
    }

    @Test("Detects a declared size that does not match what inflates")
    func detectsSizeLie() throws {
        var writer = ZipWriter()
        let text = repetitive("abcdefghij", times: 100)
        try writer.add(name: "a.txt", data: text, compress: true)
        var bytes = try writer.finish()
        let end = bytes.count - 22
        let directory = Int(bytes[end + 16]) | Int(bytes[end + 17]) << 8
        // Central header: uncompressed size at byte 24. Declare fewer, then more bytes than there are.
        for declared in [text.count - 1, text.count + 1] {
            bytes[directory + 24] = UInt8(truncatingIfNeeded: declared)
            bytes[directory + 25] = UInt8(truncatingIfNeeded: declared >> 8)
            let zip = try reader(bytes)
            #expect(throws: ZipError.damaged) { try zip.contents(of: zip.entries[0], limit: 1 << 20) }
        }
    }

    @Test("Does not open encrypted entries")
    func rejectsEncrypted() throws {
        var writer = ZipWriter()
        try writer.add(name: "a.txt", data: Data("hello".utf8), compress: false)
        var bytes = try writer.finish()
        let end = bytes.count - 22
        let directory = Int(bytes[end + 16]) | Int(bytes[end + 17]) << 8
        bytes[directory + 8] |= 0x01
        let zip = try reader(bytes)
        #expect(throws: ZipError.unsupported) { try zip.contents(of: zip.entries[0], limit: 100) }
    }
}
