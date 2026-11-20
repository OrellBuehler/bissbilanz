import Foundation

/// One dispatched server-sent event.
struct ServerSentEvent: Equatable, Sendable {
    var id: String?
    var event: String?
    var data: String
}

/// A `text/event-stream` parser after the WHATWG event-stream rules: lines end
/// in LF, CR or CRLF (also when split across chunks), `:` lines are comments
/// (the server's heartbeat), `data` lines accumulate until a blank line
/// dispatches them, and a `retry` field reports the reconnection delay.
/// Pure and incremental: bytes can arrive in any chunking.
struct ServerSentEventParser: Sendable {
    enum Output: Equatable, Sendable {
        case event(ServerSentEvent)
        /// The reconnection time the server asked for, in milliseconds.
        case retry(Int)
    }

    /// The last `id` seen, kept across events like an `EventSource` does.
    private(set) var lastEventId: String?

    private var line: [UInt8] = []
    private var data = ""
    private var hasData = false
    private var eventType: String?
    private var pendingId: String?
    private var skipLineFeed = false
    private var isStart = true

    init() {}

    mutating func feed<Bytes: Sequence>(_ bytes: Bytes) -> [Output] where Bytes.Element == UInt8 {
        var outputs: [Output] = []
        for byte in bytes {
            if skipLineFeed {
                skipLineFeed = false
                if byte == 0x0A { continue }
            }
            switch byte {
            case 0x0A:
                endLine(into: &outputs)
            case 0x0D:
                endLine(into: &outputs)
                skipLineFeed = true
            default:
                line.append(byte)
            }
        }
        return outputs
    }

    private mutating func endLine(into outputs: inout [Output]) {
        var text = String(decoding: line, as: UTF8.self)
        line.removeAll(keepingCapacity: true)
        if isStart {
            isStart = false
            if text.hasPrefix("\u{FEFF}") {
                text.removeFirst()
            }
        }
        if text.isEmpty {
            dispatch(into: &outputs)
            return
        }
        if text.hasPrefix(":") {
            return
        }
        let field: Substring
        var value: Substring
        if let colon = text.firstIndex(of: ":") {
            field = text[..<colon]
            value = text[text.index(after: colon)...]
            if value.hasPrefix(" ") {
                value = value.dropFirst()
            }
        } else {
            field = Substring(text)
            value = ""
        }
        switch field {
        case "data":
            data += value
            data += "\n"
            hasData = true
        case "event":
            eventType = String(value)
        case "id":
            if !value.utf8.contains(0) {
                pendingId = String(value)
            }
        case "retry":
            if !value.isEmpty, value.allSatisfy(\.isASCIIDigit), let milliseconds = Int(value) {
                outputs.append(.retry(milliseconds))
            }
        default:
            break
        }
    }

    private mutating func dispatch(into outputs: inout [Output]) {
        if let pendingId {
            lastEventId = pendingId
        }
        pendingId = nil
        defer {
            data = ""
            hasData = false
            eventType = nil
        }
        guard hasData else { return }
        var payload = data
        if payload.hasSuffix("\n") {
            payload.removeLast()
        }
        outputs.append(.event(ServerSentEvent(id: lastEventId, event: eventType, data: payload)))
    }
}

private extension Character {
    var isASCIIDigit: Bool {
        guard let ascii = asciiValue else { return false }
        return ascii >= 0x30 && ascii <= 0x39
    }
}

/// A non-200 answer to an event-stream request: what the caller needs to
/// classify it (status, `Retry-After`, the minimum version of a 426) and the
/// start of its body.
struct ServerSentEventRejection: Error, Equatable, Sendable {
    let status: Int
    let retryAfter: String?
    let minVersionHeader: String?
    let body: Data
}

enum ServerSentEventItem: Equatable, Sendable {
    /// The server answered 200 and the stream is open.
    case opened
    case rejected(ServerSentEventRejection)
    case event(ServerSentEvent)
    case retry(Int)
}

/// Reads an event stream off `URLSession.bytes`. Everything that touches the
/// byte sequence stays inside the task created here; only `Sendable` items
/// leave it, so the main actor never holds the non-Sendable byte iterator.
/// Cancelling the consumer cancels the request.
enum ServerSentEventTransport {
    static let maxRejectionBodyBytes = 64 * 1024

    static func connect(session: URLSession, request: URLRequest) -> AsyncThrowingStream<ServerSentEventItem, Error> {
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: ServerSentEventItem.self, throwing: Error.self)
        let task = Task {
            do {
                try await pump(session: session, request: request, continuation: continuation)
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in
            task.cancel()
        }
        return stream
    }

    private static func pump(
        session: URLSession,
        request: URLRequest,
        continuation: AsyncThrowingStream<ServerSentEventItem, Error>.Continuation
    ) async throws {
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard http.statusCode == 200 else {
            var body = Data()
            for try await byte in bytes {
                body.append(byte)
                if body.count >= maxRejectionBodyBytes { break }
            }
            continuation.yield(.rejected(ServerSentEventRejection(
                status: http.statusCode,
                retryAfter: http.value(forHTTPHeaderField: "Retry-After"),
                minVersionHeader: http.value(forHTTPHeaderField: "X-Client-Min-Version"),
                body: body
            )))
            return
        }
        continuation.yield(.opened)
        var parser = ServerSentEventParser()
        var pending: [UInt8] = []
        for try await byte in bytes {
            pending.append(byte)
            guard byte == 0x0A || byte == 0x0D else { continue }
            emit(parser.feed(pending), to: continuation)
            pending.removeAll(keepingCapacity: true)
        }
        if !pending.isEmpty {
            emit(parser.feed(pending), to: continuation)
        }
    }

    private static func emit(
        _ outputs: [ServerSentEventParser.Output],
        to continuation: AsyncThrowingStream<ServerSentEventItem, Error>.Continuation
    ) {
        for output in outputs {
            switch output {
            case let .event(event):
                continuation.yield(.event(event))
            case let .retry(milliseconds):
                continuation.yield(.retry(milliseconds))
            }
        }
    }
}
