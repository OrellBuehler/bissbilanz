import Compression
import Foundation

enum ZipError: Error, Equatable {
    case notAZip
    case damaged
    case unsupported
    case tooManyEntries
    case entryTooLarge
    case checksumMismatch
}

enum CRC32 {
    private static let table: [UInt32] = (0 ..< 256).map { (index: Int) -> UInt32 in
        var value = UInt32(index)
        for _ in 0 ..< 8 {
            value = (value & 1) == 1 ? (0xEDB8_8320 ^ (value >> 1)) : (value >> 1)
        }
        return value
    }

    static let initial: UInt32 = 0xFFFF_FFFF

    static func update(_ crc: UInt32, _ buffer: UnsafeBufferPointer<UInt8>) -> UInt32 {
        var value = crc
        for byte in buffer {
            value = table[Int((value ^ UInt32(byte)) & 0xFF)] ^ (value >> 8)
        }
        return value
    }

    static func checksum(_ data: Data) -> UInt32 {
        var crc = initial
        data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) in
            crc = update(crc, buffer.bindMemory(to: UInt8.self))
        }
        return ~crc
    }
}

struct ZipEntry: Equatable {
    let name: String
    let method: Int
    let flags: Int
    let crc32: UInt32
    let compressedSize: Int
    let uncompressedSize: Int
    let localHeaderOffset: Int

    var isDirectory: Bool { name.hasSuffix("/") }
}

/// Reads stored and deflated entries of an unencrypted zip, zip64 included,
/// through its central directory. Entries are only ever looked up by name and
/// inflated into memory — nothing is written to disk, so an entry name can never
/// escape anywhere. Sizes come from the central directory and are checked
/// against the caller's limit before anything is inflated; the inflated length
/// and CRC-32 are verified afterwards.
///
/// `init(fileURL:)` maps the file instead of reading it, so a multi-gigabyte
/// package costs address space, not memory, and an entry is only paged in when
/// it is read. `stream` hands an entry out in chunks for the ones too big to
/// hold whole (a manifest of a hundred thousand foods).
struct ZipReader {
    private let data: Data
    let entries: [ZipEntry]
    private let indexByName: [String: Int]

    private static let endSignature = 0x0605_4B50
    private static let centralSignature = 0x0201_4B50
    private static let localSignature = 0x0403_4B50
    private static let zip64EndSignature = 0x0606_4B50
    private static let zip64LocatorSignature = 0x0706_4B50
    private static let endRecordLength = 22
    private static let zip64LocatorLength = 20
    private static let zip64EndRecordLength = 56
    private static let maxCommentLength = 0xFFFF
    private static let sentinel32 = 0xFFFF_FFFF

    init(fileURL: URL, maxEntries: Int) throws {
        try self.init(data: Data(contentsOf: fileURL, options: .alwaysMapped), maxEntries: maxEntries)
    }

    init(data: Data, maxEntries: Int) throws {
        guard data.count >= Self.endRecordLength else { throw ZipError.notAZip }
        self.data = data

        var end: Int?
        var candidate = data.count - Self.endRecordLength
        let lowest = max(0, candidate - Self.maxCommentLength)
        while candidate >= lowest {
            if try Self.u32(data, candidate) == Self.endSignature {
                let commentLength = try Self.u16(data, candidate + 20)
                if candidate + Self.endRecordLength + commentLength <= data.count {
                    end = candidate
                    break
                }
            }
            candidate -= 1
        }
        guard let end else { throw ZipError.notAZip }

        var total = try Self.u16(data, end + 10)
        var directorySize = try Self.u32(data, end + 12)
        var directoryOffset = try Self.u32(data, end + 16)
        var directoryLimit = end
        if total == 0xFFFF || directorySize == Self.sentinel32 || directoryOffset == Self.sentinel32 {
            if let zip64 = try Self.zip64End(data, end: end) {
                total = zip64.total
                directorySize = zip64.size
                directoryOffset = zip64.offset
                directoryLimit = zip64.recordStart
            } else if directorySize == Self.sentinel32 || directoryOffset == Self.sentinel32 {
                throw ZipError.damaged
            }
        }
        guard total <= maxEntries else { throw ZipError.tooManyEntries }
        guard directoryOffset + directorySize <= directoryLimit else { throw ZipError.damaged }

        var parsed: [ZipEntry] = []
        parsed.reserveCapacity(total)
        var offset = directoryOffset
        for _ in 0 ..< total {
            guard try Self.u32(data, offset) == Self.centralSignature else { throw ZipError.damaged }
            let flags = try Self.u16(data, offset + 8)
            let method = try Self.u16(data, offset + 10)
            let crc = try Self.u32(data, offset + 16)
            var compressed = try Self.u32(data, offset + 20)
            var uncompressed = try Self.u32(data, offset + 24)
            let nameLength = try Self.u16(data, offset + 28)
            let extraLength = try Self.u16(data, offset + 30)
            let commentLength = try Self.u16(data, offset + 32)
            var localOffset = try Self.u32(data, offset + 42)
            let nameStart = offset + 46
            guard nameStart + nameLength + extraLength <= data.count else { throw ZipError.damaged }
            if compressed == Self.sentinel32 || uncompressed == Self.sentinel32 || localOffset == Self.sentinel32 {
                try Self.applyZip64Extra(
                    data, extraStart: nameStart + nameLength, extraLength: extraLength,
                    uncompressed: &uncompressed, compressed: &compressed, localOffset: &localOffset
                )
            }
            let nameBytes = data.subdata(in: data.startIndex + nameStart ..< data.startIndex + nameStart + nameLength)
            let name = String(data: nameBytes, encoding: .utf8) ?? String(decoding: nameBytes, as: UTF8.self)
            parsed.append(ZipEntry(
                name: name,
                method: method,
                flags: flags,
                crc32: UInt32(truncatingIfNeeded: crc),
                compressedSize: compressed,
                uncompressedSize: uncompressed,
                localHeaderOffset: localOffset
            ))
            offset = nameStart + nameLength + extraLength + commentLength
        }
        entries = parsed
        var index: [String: Int] = [:]
        index.reserveCapacity(parsed.count)
        for (position, entry) in parsed.enumerated() where index[entry.name] == nil {
            index[entry.name] = position
        }
        indexByName = index
    }

    /// The zip64 end-of-central-directory record the locator right before the
    /// ordinary end record points at. Nil when there is no locator.
    private static func zip64End(
        _ data: Data, end: Int
    ) throws -> (total: Int, size: Int, offset: Int, recordStart: Int)? {
        let locator = end - zip64LocatorLength
        guard locator >= 0, try u32(data, locator) == zip64LocatorSignature else { return nil }
        let record = try u64(data, locator + 8)
        guard record + zip64EndRecordLength <= locator, try u32(data, record) == zip64EndSignature else {
            throw ZipError.damaged
        }
        return try (
            total: u64(data, record + 32),
            size: u64(data, record + 40),
            offset: u64(data, record + 48),
            recordStart: record
        )
    }

    /// Reads the zip64 extended information extra field (id 0x0001): the 64-bit
    /// values of exactly those fields whose 32-bit slot holds 0xFFFFFFFF, in the
    /// order uncompressed size, compressed size, local header offset.
    private static func applyZip64Extra(
        _ data: Data,
        extraStart: Int,
        extraLength: Int,
        uncompressed: inout Int,
        compressed: inout Int,
        localOffset: inout Int
    ) throws {
        var position = extraStart
        let extraEnd = extraStart + extraLength
        while position + 4 <= extraEnd {
            let id = try u16(data, position)
            let size = try u16(data, position + 2)
            let fieldsEnd = position + 4 + size
            guard fieldsEnd <= extraEnd else { throw ZipError.damaged }
            if id == 1 {
                var cursor = position + 4
                if uncompressed == sentinel32 {
                    guard cursor + 8 <= fieldsEnd else { throw ZipError.damaged }
                    uncompressed = try u64(data, cursor)
                    cursor += 8
                }
                if compressed == sentinel32 {
                    guard cursor + 8 <= fieldsEnd else { throw ZipError.damaged }
                    compressed = try u64(data, cursor)
                    cursor += 8
                }
                if localOffset == sentinel32 {
                    guard cursor + 8 <= fieldsEnd else { throw ZipError.damaged }
                    localOffset = try u64(data, cursor)
                }
                return
            }
            position = fieldsEnd
        }
        throw ZipError.damaged
    }

    func entry(named name: String) -> ZipEntry? {
        indexByName[name].map { entries[$0] }
    }

    /// The inflated bytes of `entry`. `limit` caps the size the archive declares
    /// for it — the declared size is what bounds the memory spent here.
    func contents(of entry: ZipEntry, limit: Int) throws -> Data {
        guard entry.flags & 1 == 0 else { throw ZipError.unsupported }
        guard entry.uncompressedSize <= limit else { throw ZipError.entryTooLarge }
        let header = entry.localHeaderOffset
        guard try Self.u32(data, header) == Self.localSignature else { throw ZipError.damaged }
        let start = try header + 30 + Self.u16(data, header + 26) + Self.u16(data, header + 28)
        guard start + entry.compressedSize <= data.count else { throw ZipError.damaged }
        let raw = data.subdata(in: data.startIndex + start ..< data.startIndex + start + entry.compressedSize)

        let output: Data
        switch entry.method {
        case 0:
            guard entry.compressedSize == entry.uncompressedSize else { throw ZipError.damaged }
            output = raw
        case 8:
            output = try Self.inflate(raw, size: entry.uncompressedSize)
        default:
            throw ZipError.unsupported
        }
        guard CRC32.checksum(output) == entry.crc32 else { throw ZipError.checksumMismatch }
        return output
    }

    private static let streamChunkBytes = 256 * 1024

    /// Hands the inflated bytes of `entry` to `body` in chunks, never holding
    /// more than one chunk of output. `limit` caps the size the archive declares
    /// for it; the inflated length may not exceed what was declared, and the
    /// length and CRC-32 are checked once the last chunk is out — so a damaged
    /// entry throws after `body` has already seen its bytes.
    func stream(
        _ entry: ZipEntry,
        limit: Int,
        body: (UnsafeBufferPointer<UInt8>) throws -> Void
    ) throws {
        guard entry.flags & 1 == 0 else { throw ZipError.unsupported }
        guard entry.uncompressedSize <= limit else { throw ZipError.entryTooLarge }
        let header = entry.localHeaderOffset
        guard try Self.u32(data, header) == Self.localSignature else { throw ZipError.damaged }
        let start = try header + 30 + Self.u16(data, header + 26) + Self.u16(data, header + 28)
        guard start + entry.compressedSize <= data.count else { throw ZipError.damaged }
        let region = data[data.startIndex + start ..< data.startIndex + start + entry.compressedSize]

        var crc = CRC32.initial
        var total = 0
        let expectedSize = entry.uncompressedSize
        func tally(_ chunk: UnsafeBufferPointer<UInt8>) throws {
            total += chunk.count
            guard total <= expectedSize else { throw ZipError.damaged }
            crc = CRC32.update(crc, chunk)
            try body(chunk)
        }
        switch entry.method {
        case 0:
            guard entry.compressedSize == entry.uncompressedSize else { throw ZipError.damaged }
            try region.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
                let bytes = raw.bindMemory(to: UInt8.self)
                var offset = 0
                while offset < bytes.count {
                    let length = min(Self.streamChunkBytes, bytes.count - offset)
                    try tally(UnsafeBufferPointer(rebasing: bytes[offset ..< offset + length]))
                    offset += length
                }
            }
        case 8:
            try Self.inflateStream(region, tally: tally)
        default:
            throw ZipError.unsupported
        }
        guard total == expectedSize, ~crc == entry.crc32 else { throw ZipError.checksumMismatch }
    }

    private static func inflateStream(
        _ input: Data,
        tally: (UnsafeBufferPointer<UInt8>) throws -> Void
    ) throws {
        if input.isEmpty { return }
        let output = UnsafeMutablePointer<UInt8>.allocate(capacity: streamChunkBytes)
        defer { output.deallocate() }
        let placeholder = UnsafeMutablePointer<UInt8>.allocate(capacity: 1)
        defer { placeholder.deallocate() }
        var stream = compression_stream(
            dst_ptr: placeholder, dst_size: 0, src_ptr: UnsafePointer(placeholder), src_size: 0, state: nil
        )
        guard compression_stream_init(&stream, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else {
            throw ZipError.damaged
        }
        defer { compression_stream_destroy(&stream) }

        try input.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { throw ZipError.damaged }
            stream.src_ptr = base
            stream.src_size = raw.count
            stream.dst_ptr = output
            stream.dst_size = streamChunkBytes
            var idleRounds = 0
            while true {
                let status = compression_stream_process(&stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
                let produced = streamChunkBytes - stream.dst_size
                if produced > 0 {
                    idleRounds = 0
                    try tally(UnsafeBufferPointer(start: output, count: produced))
                } else {
                    idleRounds += 1
                }
                switch status {
                case COMPRESSION_STATUS_END:
                    return
                case COMPRESSION_STATUS_OK:
                    guard idleRounds < 2 else { throw ZipError.damaged }
                    stream.dst_ptr = output
                    stream.dst_size = streamChunkBytes
                default:
                    throw ZipError.damaged
                }
            }
        }
    }

    /// Raw DEFLATE (what `COMPRESSION_ZLIB` decodes) of exactly `size` bytes. One
    /// spare byte in the buffer tells a stream that inflates to more than the
    /// header claims apart from one that fills it exactly.
    private static func inflate(_ input: Data, size: Int) throws -> Data {
        if size == 0 { return Data() }
        guard !input.isEmpty else { throw ZipError.damaged }
        var output = Data(count: size + 1)
        let written = output.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) -> Int in
            input.withUnsafeBytes { (source: UnsafeRawBufferPointer) -> Int in
                compression_decode_buffer(
                    destination.bindMemory(to: UInt8.self).baseAddress!, size + 1,
                    source.bindMemory(to: UInt8.self).baseAddress!, input.count,
                    nil, COMPRESSION_ZLIB
                )
            }
        }
        guard written == size else { throw ZipError.damaged }
        output.removeLast()
        return output
    }

    private static func u16(_ data: Data, _ offset: Int) throws -> Int {
        guard offset >= 0, offset + 2 <= data.count else { throw ZipError.damaged }
        let base = data.startIndex + offset
        return Int(data[base]) | (Int(data[base + 1]) << 8)
    }

    private static func u64(_ data: Data, _ offset: Int) throws -> Int {
        let low = try u32(data, offset)
        let high = try u32(data, offset + 4)
        guard high < 0x4000_0000 else { throw ZipError.damaged }
        return low | (high << 32)
    }

    private static func u32(_ data: Data, _ offset: Int) throws -> Int {
        guard offset >= 0, offset + 4 <= data.count else { throw ZipError.damaged }
        let base = data.startIndex + offset
        let low = Int(data[base]) | (Int(data[base + 1]) << 8)
        let high = Int(data[base + 2]) | (Int(data[base + 3]) << 8)
        return low | (high << 16)
    }
}

/// Writes a plain zip: standard local headers followed by a central directory,
/// sizes and CRC known up front (no data descriptors), so any reader — fflate
/// on the server included — takes it.
struct ZipWriter {
    private var body = Data()
    private var directory = Data()
    private var count = 0
    private let dosTime: Int
    private let dosDate: Int

    /// `date` is stamped on every entry; pass a fixed one for reproducible output.
    init(date: Date = Date()) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let year = parts.year ?? 1980
        if year < 1980 {
            dosDate = (1 << 5) | 1
            dosTime = 0
        } else {
            dosDate = ((min(year, 2107) - 1980) << 9) | ((parts.month ?? 1) << 5) | (parts.day ?? 1)
            dosTime = ((parts.hour ?? 0) << 11) | ((parts.minute ?? 0) << 5) | ((parts.second ?? 0) / 2)
        }
    }

    /// Deflates the entry when that makes it smaller; otherwise stores it.
    mutating func add(name: String, data: Data, compress: Bool) throws {
        let nameBytes = Data(name.utf8)
        guard nameBytes.count <= 0xFFFF, count < 0xFFFF,
              data.count < 0xFFFF_FFFF, body.count < 0xFFFF_FFFF
        else { throw ZipError.entryTooLarge }

        var method = 0
        var payload = data
        if compress, !data.isEmpty, let deflated = Self.deflate(data), deflated.count < data.count {
            method = 8
            payload = deflated
        }
        let crc = Int(CRC32.checksum(data))
        let offset = body.count

        body.appendLE32(0x0403_4B50)
        body.appendLE16(20)
        body.appendLE16(0x0800)
        body.appendLE16(method)
        body.appendLE16(dosTime)
        body.appendLE16(dosDate)
        body.appendLE32(crc)
        body.appendLE32(payload.count)
        body.appendLE32(data.count)
        body.appendLE16(nameBytes.count)
        body.appendLE16(0)
        body.append(nameBytes)
        body.append(payload)

        directory.appendLE32(0x0201_4B50)
        directory.appendLE16(20)
        directory.appendLE16(20)
        directory.appendLE16(0x0800)
        directory.appendLE16(method)
        directory.appendLE16(dosTime)
        directory.appendLE16(dosDate)
        directory.appendLE32(crc)
        directory.appendLE32(payload.count)
        directory.appendLE32(data.count)
        directory.appendLE16(nameBytes.count)
        directory.appendLE16(0)
        directory.appendLE16(0)
        directory.appendLE16(0)
        directory.appendLE16(0)
        directory.appendLE32(0)
        directory.appendLE32(offset)
        directory.append(nameBytes)
        count += 1
    }

    func finish() throws -> Data {
        guard body.count + directory.count < 0xFFFF_FFFF else { throw ZipError.entryTooLarge }
        var output = body
        output.append(directory)
        output.appendLE32(0x0605_4B50)
        output.appendLE16(0)
        output.appendLE16(0)
        output.appendLE16(count)
        output.appendLE16(count)
        output.appendLE32(directory.count)
        output.appendLE32(body.count)
        output.appendLE16(0)
        return output
    }

    private static func deflate(_ input: Data) -> Data? {
        var output = Data(count: input.count + input.count / 8 + 1024)
        let capacity = output.count
        let written = output.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) -> Int in
            input.withUnsafeBytes { (source: UnsafeRawBufferPointer) -> Int in
                compression_encode_buffer(
                    destination.bindMemory(to: UInt8.self).baseAddress!, capacity,
                    source.bindMemory(to: UInt8.self).baseAddress!, input.count,
                    nil, COMPRESSION_ZLIB
                )
            }
        }
        guard written > 0 else { return nil }
        output.removeSubrange(written ..< output.count)
        return output
    }
}

private extension Data {
    mutating func appendLE16(_ value: Int) {
        append(UInt8(truncatingIfNeeded: value))
        append(UInt8(truncatingIfNeeded: value >> 8))
    }

    mutating func appendLE32(_ value: Int) {
        append(UInt8(truncatingIfNeeded: value))
        append(UInt8(truncatingIfNeeded: value >> 8))
        append(UInt8(truncatingIfNeeded: value >> 16))
        append(UInt8(truncatingIfNeeded: value >> 24))
    }
}
