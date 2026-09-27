import Foundation

/// Pure text helpers for `AiTaskProcessor`'s "link pass": pulling URLs out of
/// a task's free-text description, and turning a fetched web page into short
/// plain text a Foundation Models prompt can use. Kept dependency-free (no
/// `NSAttributedString`/WebKit HTML parsing, which needs the main thread on
/// older OS versions) so both halves are unit-testable without a network call
/// or the model itself — see `AiTaskProcessorTests`.
enum AiTaskLinkExtractor {
    /// Every `http`/`https` URL in `text`, in the order they appear.
    /// `NSDataDetector` is the same detector `UITextView`'s data-link
    /// highlighting uses, so trailing-punctuation/parenthesis edge cases in a
    /// free-text description are Apple's problem, not a hand-rolled regex's.
    static func urls(in text: String) -> [URL] {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return []
        }
        let range = NSRange(text.startIndex..., in: text)
        return detector.matches(in: text, range: range).compactMap { match in
            guard let url = match.url, let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https"
            else { return nil }
            return url
        }
    }

    /// Strips script/style blocks and tags out of `html`, decodes the handful
    /// of entities a product page is likely to use, collapses whitespace, and
    /// truncates to `maxLength` characters so a whole page fits a Foundation
    /// Models prompt. A lightweight substitute for a real HTML parser — good
    /// enough for "does this page mention a product name and its nutrition
    /// facts", not a general-purpose renderer.
    static func plainText(fromHTML html: String, maxLength: Int = 4000) -> String {
        var text = html
        for tag in ["script", "style", "noscript"] {
            text = text.replacingOccurrences(
                of: "<\(tag)[^>]*>.*?</\(tag)>",
                with: " ",
                options: [.regularExpression, .caseInsensitive]
            )
        }
        text = text.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        for (entity, replacement) in htmlEntities {
            text = text.replacingOccurrences(of: entity, with: replacement)
        }
        text = text
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count > maxLength else { return text }
        return String(text.prefix(maxLength))
    }

    private static let htmlEntities: [String: String] = [
        "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
        "&quot;": "\"", "&#39;": "'", "&apos;": "'",
    ]

    /// Fetches `url` with a short timeout and returns its stripped, truncated
    /// text — nil on any failure (offline, timeout, non-2xx, undecodable
    /// body), so a bad link degrades to "nothing extra found" rather than
    /// failing the whole task.
    static func fetchPlainText(from url: URL, timeout: TimeInterval = 5, maxLength: Int = 4000) async -> String? {
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode),
              let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1)
        else { return nil }
        return plainText(fromHTML: html, maxLength: maxLength)
    }
}
