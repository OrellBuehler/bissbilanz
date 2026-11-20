@testable import Bissbilanz
import Foundation
import Testing

@Suite("Chat markdown")
struct ChatMarkdownTests {
    @Test("Paragraphs split on blank lines and keep their line breaks")
    func paragraphs() {
        #expect(ChatMarkdown.blocks("First line\nsecond line\n\nNext paragraph") == [
            .paragraph("First line\nsecond line"),
            .paragraph("Next paragraph")
        ])
    }

    @Test("Headings, rules and quotes")
    func headingsRulesQuotes() {
        let blocks = ChatMarkdown.blocks("## Today ##\nText\n---\n> Quoted\n> on two lines\n#hashtag")
        #expect(blocks == [
            .heading(level: 2, text: "Today"),
            .paragraph("Text"),
            .rule,
            .quote("Quoted\non two lines"),
            .paragraph("#hashtag")
        ])
    }

    @Test("Bullet and numbered lists, nested by indent, with continuation lines")
    func lists() {
        let markdown = """
        - Breakfast: **320 kcal**
        - Lunch
          - Salad
          with dressing
        1. First
        2) Second
        """
        #expect(ChatMarkdown.blocks(markdown) == [
            .listItem(marker: "•", depth: 0, text: "Breakfast: **320 kcal**"),
            .listItem(marker: "•", depth: 0, text: "Lunch"),
            .listItem(marker: "◦", depth: 1, text: "Salad with dressing"),
            .listItem(marker: "1.", depth: 0, text: "First"),
            .listItem(marker: "2.", depth: 0, text: "Second")
        ])
    }

    @Test("A rule of stars is not a list; a dash without a space is not a bullet")
    func ruleVersusList() {
        #expect(ChatMarkdown.blocks("* * *") == [.rule])
        #expect(ChatMarkdown.blocks("-5 kcal") == [.paragraph("-5 kcal")])
        #expect(ChatMarkdown.blocks("2026. A year") == [.listItem(marker: "2026.", depth: 0, text: "A year")])
    }

    @Test("Fenced code keeps its lines, also while the fence is still open")
    func code() {
        #expect(ChatMarkdown.blocks("```\nlet a = 1\n  indented\n```\nAfter") == [
            .code("let a = 1\n  indented"),
            .paragraph("After")
        ])
        #expect(ChatMarkdown.blocks("Before\n```json\n{\"a\": 1}") == [
            .paragraph("Before"),
            .code("{\"a\": 1}")
        ])
    }

    @Test("CRLF text and an empty answer")
    func lineEndingsAndEmpty() {
        #expect(ChatMarkdown.blocks("One\r\n\r\nTwo") == [.paragraph("One"), .paragraph("Two")])
        #expect(ChatMarkdown.blocks("").isEmpty)
        #expect(ChatMarkdown.blocks("\n\n").isEmpty)
    }

    @Test("Inline styles become attributes")
    func inlineStyles() {
        let text = ChatMarkdown.inline("**Bold**, *italic*, `code` and [a link](https://example.com)")
        #expect(String(text.characters) == "Bold, italic, code and a link")
        var intents: [InlinePresentationIntent] = []
        var links: [URL] = []
        for run in text.runs {
            if let intent = run.inlinePresentationIntent {
                intents.append(intent)
            }
            if let link = run.link {
                links.append(link)
            }
        }
        #expect(intents.contains(.stronglyEmphasized))
        #expect(intents.contains(.emphasized))
        #expect(intents.contains(.code))
        #expect(links == [URL(string: "https://example.com")!])
    }

    private static func links(_ text: AttributedString) -> [URL] {
        var links: [URL] = []
        for run in text.runs {
            if let link = run.link, links.last != link {
                links.append(link)
            }
        }
        return links
    }

    @Test("Only web links survive, also with parentheses in the address")
    func webLinksOnly() throws {
        let text = ChatMarkdown.inline(
            "[Bread](https://en.wikipedia.org/wiki/Bread_(food)), [mail](mailto:a@example.com), [x](javascript:alert(1))"
        )
        let bread = try #require(URL(string: "https://en.wikipedia.org/wiki/Bread_(food)"))
        #expect(Self.links(text) == [bread])
    }

    @Test("Bare web addresses become links; a parenthesis around them stays outside")
    func bareAddresses() throws {
        let text = ChatMarkdown.inline(
            "See https://en.wikipedia.org/wiki/Bread_(food) or (https://example.com/a). `https://code.example`"
        )
        let bread = try #require(URL(string: "https://en.wikipedia.org/wiki/Bread_(food)"))
        let example = try #require(URL(string: "https://example.com/a"))
        #expect(Self.links(text) == [bread, example])
        let secure = try #require(URL(string: "HTTPS://example.com"))
        let phone = try #require(URL(string: "tel:123"))
        #expect(ChatMarkdown.isWebLink(secure))
        #expect(!ChatMarkdown.isWebLink(phone))
    }

    @Test("Unbalanced markers stay readable")
    func unbalanced() {
        #expect(String(ChatMarkdown.inline("2 * 3 = 6 and **open").characters).contains("2"))
    }
}

@Suite("Chat limits")
struct ChatLimitsTests {
    @Test("Length counts UTF-16 units, as the server does")
    func length() {
        #expect(ChatLimits.length("abc") == 3)
        #expect(ChatLimits.length("🍎") == 2)
    }

    @Test("Clamping never splits a character")
    func clamped() {
        #expect(ChatLimits.clamped("abcdef", maxUTF16: 4) == "abcd")
        #expect(ChatLimits.clamped("ab🍎", maxUTF16: 3) == "ab")
        #expect(ChatLimits.clamped("short", maxUTF16: 120) == "short")
    }

    @Test("The list is newest first, ties keep the server order")
    func sorting() {
        let items = [
            ChatConversationListItem(id: "a", lastMessageAt: "2026-11-18T10:00:00.000Z", lastSeq: 1),
            ChatConversationListItem(id: "b", lastMessageAt: "2026-11-19T10:00:00.000Z", lastSeq: 1),
            ChatConversationListItem(id: "c", lastMessageAt: "2026-11-18T10:00:00.000Z", lastSeq: 1)
        ]
        #expect(ChatStore.sortedNewestFirst(items).map(\.id) == ["b", "a", "c"])
    }
}
