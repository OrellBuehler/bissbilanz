@testable import Bissbilanz
import Foundation
import Testing

@Suite("Server-sent event parser")
struct ServerSentEventParserTests {
    private static func parse(_ text: String) -> [ServerSentEventParser.Output] {
        var parser = ServerSentEventParser()
        return parser.feed(Array(text.utf8))
    }

    /// Feeds `text` in chunks of `size` bytes, as a network read might split it.
    private static func parse(_ text: String, chunkSize size: Int) -> [ServerSentEventParser.Output] {
        var parser = ServerSentEventParser()
        let bytes = Array(text.utf8)
        var outputs: [ServerSentEventParser.Output] = []
        var start = 0
        while start < bytes.count {
            let end = min(start + size, bytes.count)
            outputs += parser.feed(bytes[start ..< end])
            start = end
        }
        return outputs
    }

    private static func events(_ outputs: [ServerSentEventParser.Output]) -> [ServerSentEvent] {
        outputs.compactMap { output in
            if case let .event(event) = output { return event }
            return nil
        }
    }

    /// The stream as docs/ai-chat.md §5.1 shows it.
    private static let documented = """
    retry: 3000

    id: 3
    event: text_delta
    data: {"seq":3,"type":"text_delta","text":"Let me "}

    : ping

    id: 4
    event: run_finished
    data: {"seq":4,"type":"run_finished"}


    """

    @Test("The documented stream gives its retry and both events")
    func documentedStream() {
        let outputs = Self.parse(Self.documented)
        #expect(outputs == [
            .retry(3000),
            .event(ServerSentEvent(id: "3", event: "text_delta", data: #"{"seq":3,"type":"text_delta","text":"Let me "}"#)),
            .event(ServerSentEvent(id: "4", event: "run_finished", data: #"{"seq":4,"type":"run_finished"}"#))
        ])
    }

    @Test("Any chunking, down to single bytes, parses the same")
    func chunking() {
        let whole = Self.parse(Self.documented)
        for size in [1, 2, 3, 7, 16, 64] {
            #expect(Self.parse(Self.documented, chunkSize: size) == whole)
        }
    }

    @Test("Comments and heartbeats dispatch nothing")
    func comments() {
        #expect(Self.parse(": ping\n\n:\n\n: another\n\n").isEmpty)
    }

    @Test("Several data lines join with line feeds")
    func multiLineData() {
        let events = Self.events(Self.parse("data: first\ndata: second\ndata:\ndata: fourth\n\n"))
        #expect(events.map(\.data) == ["first\nsecond\n\nfourth"])
    }

    @Test("Only one space after the colon is dropped; a field without a colon has an empty value")
    func fieldValues() {
        let events = Self.events(Self.parse("data:no space\n\ndata:  two spaces\n\ndata\n\n"))
        #expect(events.map(\.data) == ["no space", " two spaces", ""])
    }

    @Test("CRLF and lone CR end lines too, also split across chunks")
    func lineEndings() {
        let crlf = "id: 1\r\ndata: a\r\n\r\nid: 2\rdata: b\r\r"
        let expected = [
            ServerSentEvent(id: "1", event: nil, data: "a"),
            ServerSentEvent(id: "2", event: nil, data: "b")
        ]
        #expect(Self.events(Self.parse(crlf)) == expected)
        #expect(Self.events(Self.parse(crlf, chunkSize: 1)) == expected)
        var parser = ServerSentEventParser()
        let first = parser.feed(Array("data: x\r".utf8))
        let second = parser.feed(Array("\n\r\n".utf8))
        #expect(first.isEmpty)
        #expect(Self.events(second) == [ServerSentEvent(id: nil, event: nil, data: "x")])
    }

    @Test("The last id carries over to events without one; an id with NUL is ignored")
    func lastEventId() {
        var parser = ServerSentEventParser()
        let outputs = parser.feed(Array("id: 7\ndata: a\n\ndata: b\n\nid: bad\u{0}id\ndata: c\n\n".utf8))
        #expect(Self.events(outputs).map(\.id) == ["7", "7", "7"])
        #expect(parser.lastEventId == "7")
    }

    @Test("Event type resets after each dispatch")
    func eventTypeResets() {
        let events = Self.events(Self.parse("event: tool_started\ndata: a\n\ndata: b\n\n"))
        #expect(events.map(\.event) == ["tool_started", nil])
    }

    @Test("Only digits make a retry; unknown fields are ignored")
    func retryAndUnknownFields() {
        #expect(Self.parse("retry: 1500\nretry: soon\nfoo: bar\n\n") == [.retry(1500)])
    }

    @Test("A byte order mark at the start is dropped")
    func byteOrderMark() {
        let events = Self.events(Self.parse("\u{FEFF}data: hi\n\n"))
        #expect(events.map(\.data) == ["hi"])
    }

    @Test("An event cut off by the end of the stream is not dispatched")
    func unterminatedEvent() {
        #expect(Self.parse("data: complete\n\ndata: cut off\n").count == 1)
    }

    @Test("Multi-byte characters split between chunks survive")
    func utf8AcrossChunks() {
        let text = "data: Grüezi 🍎\n\n"
        #expect(Self.events(Self.parse(text, chunkSize: 1)).map(\.data) == ["Grüezi 🍎"])
    }
}
