import Foundation

/// One block of an assistant answer. Inline styling (bold, italic, inline
/// code, links) stays in the text and is rendered by `ChatMarkdown.inline`.
enum ChatMarkdownBlock: Equatable, Sendable {
    case paragraph(String)
    case heading(level: Int, text: String)
    /// `marker` is "•" for bullets (by depth) or "3." for numbered items.
    case listItem(marker: String, depth: Int, text: String)
    case code(String)
    case quote(String)
    case rule
}

/// A small block-level Markdown reader for the assistant's answers:
/// paragraphs, ATX headings, bullet and numbered lists (nested by indent),
/// fenced code, quotes and rules. `AttributedString(markdown:)` does the
/// inline part. An unclosed fence still renders, as an answer streams in.
enum ChatMarkdown {
    static func blocks(_ markdown: String) -> [ChatMarkdownBlock] {
        var reader = Reader()
        let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        for line in lines {
            reader.read(line)
        }
        reader.finish()
        return reader.blocks
    }

    /// Inline Markdown as attributes. Bare web addresses become links too, with
    /// the parser's rules for parentheses (a balanced `(food)` belongs to the
    /// address, a closing one after it does not). Only http and https links
    /// survive: a tap must never open anything but the web.
    static func inline(_ text: String) -> AttributedString {
        let parsed: AttributedString
        do {
            parsed = try AttributedString(
                markdown: text,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .inlineOnlyPreservingWhitespace,
                    failurePolicy: .returnPartiallyParsedIfPossible
                )
            )
        } catch {
            ErrorReporter.addBreadcrumb(
                "Chat markdown shown as plain text",
                category: "chat",
                level: .warning,
                data: ["reason": error.localizedDescription]
            )
            parsed = AttributedString(text)
        }
        return linkingBareAddresses(in: parsed).transformingAttributes(\.link) { link in
            if let url = link.value, !isWebLink(url) {
                link.value = nil
            }
        }
    }

    static func isWebLink(_ url: URL) -> Bool {
        switch url.scheme?.lowercased() {
        case "http"?, "https"?: true
        default: false
        }
    }

    private static func linkingBareAddresses(in text: AttributedString) -> AttributedString {
        let plain = String(text.characters)
        guard plain.localizedCaseInsensitiveContains("http") || plain.localizedCaseInsensitiveContains("www.") else {
            return text
        }
        let detector: NSDataDetector
        do {
            detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        } catch {
            ErrorReporter.addBreadcrumb("Chat link detection unavailable", category: "chat", data: [
                "reason": error.localizedDescription
            ])
            return text
        }
        var result = text
        let matches = detector.matches(in: plain, range: NSRange(plain.startIndex..., in: plain))
        for match in matches {
            guard let url = match.url, isWebLink(url), let range = Range(match.range, in: plain) else { continue }
            let offset = plain.distance(from: plain.startIndex, to: range.lowerBound)
            let length = plain.distance(from: range.lowerBound, to: range.upperBound)
            let lower = result.index(result.startIndex, offsetByCharacters: offset)
            let upper = result.index(lower, offsetByCharacters: length)
            guard isPlainText(result[lower ..< upper]) else { continue }
            result[lower ..< upper].link = url
        }
        return result
    }

    /// Not a link already, and not inline code.
    private static func isPlainText(_ text: AttributedSubstring) -> Bool {
        text.runs.allSatisfy { run in
            run.link == nil && run.inlinePresentationIntent?.contains(.code) != true
        }
    }

    private struct Reader {
        var blocks: [ChatMarkdownBlock] = []
        private var paragraph: [String] = []
        private var quote: [String] = []
        private var code: [String]?

        mutating func read(_ line: String) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if code != nil {
                if trimmed.hasPrefix("```") {
                    closeCode()
                } else {
                    code?.append(line)
                }
                return
            }
            if trimmed.hasPrefix("```") {
                flush()
                code = []
                return
            }
            if trimmed.isEmpty {
                flush()
                return
            }
            if trimmed.hasPrefix(">") {
                flushParagraph()
                quote.append(String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces))
                return
            }
            flushQuote()
            if let heading = ChatMarkdown.heading(trimmed) {
                flushParagraph()
                blocks.append(heading)
            } else if ChatMarkdown.isRule(trimmed) {
                flushParagraph()
                blocks.append(.rule)
            } else if let item = ChatMarkdown.listItem(line) {
                flushParagraph()
                blocks.append(item)
            } else if paragraph.isEmpty, line.hasPrefix("  "), case let .listItem(marker, depth, text)? = blocks.last {
                blocks[blocks.count - 1] = .listItem(marker: marker, depth: depth, text: text + " " + trimmed)
            } else {
                paragraph.append(trimmed)
            }
        }

        mutating func finish() {
            if code != nil {
                closeCode()
            }
            flush()
        }

        private mutating func closeCode() {
            blocks.append(.code((code ?? []).joined(separator: "\n")))
            code = nil
        }

        private mutating func flush() {
            flushParagraph()
            flushQuote()
        }

        private mutating func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            blocks.append(.paragraph(paragraph.joined(separator: "\n")))
            paragraph = []
        }

        private mutating func flushQuote() {
            guard !quote.isEmpty else { return }
            blocks.append(.quote(quote.joined(separator: "\n")))
            quote = []
        }
    }

    private static func heading(_ line: String) -> ChatMarkdownBlock? {
        let hashes = line.prefix { $0 == "#" }.count
        guard (1 ... 6).contains(hashes) else { return nil }
        let rest = line.dropFirst(hashes)
        guard rest.isEmpty || rest.hasPrefix(" ") else { return nil }
        var text = rest.trimmingCharacters(in: .whitespaces)
        while text.hasSuffix("#") {
            text.removeLast()
        }
        return .heading(level: hashes, text: text.trimmingCharacters(in: .whitespaces))
    }

    private static func isRule(_ line: String) -> Bool {
        let marks = line.filter { $0 != " " }
        guard marks.count >= 3, let first = marks.first, "-*_".contains(first) else { return false }
        return marks.allSatisfy { $0 == first }
    }

    private static let bullets = ["•", "◦", "▪"]

    private static func listItem(_ line: String) -> ChatMarkdownBlock? {
        var indent = 0
        for character in line {
            if character == " " {
                indent += 1
            } else if character == "\t" {
                indent += 4
            } else {
                break
            }
        }
        let content = line.trimmingCharacters(in: .whitespaces)
        let depth = min(indent / 2, 3)
        if let first = content.first, "-*+".contains(first), content.dropFirst().hasPrefix(" ") {
            let text = content.dropFirst(2).trimmingCharacters(in: .whitespaces)
            return .listItem(marker: bullets[min(depth, bullets.count - 1)], depth: depth, text: text)
        }
        let digits = content.prefix { $0.isASCII && $0.isNumber }
        guard (1 ... 9).contains(digits.count) else { return nil }
        let afterDigits = content.dropFirst(digits.count)
        guard let delimiter = afterDigits.first, delimiter == "." || delimiter == ")",
              afterDigits.dropFirst().hasPrefix(" ")
        else { return nil }
        let text = afterDigits.dropFirst(2).trimmingCharacters(in: .whitespaces)
        return .listItem(marker: "\(digits).", depth: depth, text: text)
    }
}
