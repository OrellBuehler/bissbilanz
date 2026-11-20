import SwiftUI

/// An assistant answer rendered natively: `ChatMarkdown` splits it into
/// blocks, `AttributedString(markdown:)` styles the inline parts (bold,
/// italic, inline code, links). Finished text is parsed once and cached; only
/// the part still streaming is parsed again on every delta.
struct ChatMarkdownView: View {
    let text: String
    var isStreaming = false

    var body: some View {
        let blocks = isStreaming ? ChatMarkdown.blocks(text) : ChatMarkdownCache.blocks(for: text)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                ChatMarkdownBlockView(block: block, isStreaming: isStreaming)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Parsed answers by text, so re-rendering the transcript for a streamed
/// delta does not parse every message above it again. Cleared whole when full.
@MainActor
enum ChatMarkdownCache {
    private static var blocks: [String: [ChatMarkdownBlock]] = [:]
    private static var inlines: [String: AttributedString] = [:]
    private static let limit = 500

    static func blocks(for text: String) -> [ChatMarkdownBlock] {
        if let cached = blocks[text] {
            return cached
        }
        let parsed = ChatMarkdown.blocks(text)
        if blocks.count >= limit {
            blocks.removeAll(keepingCapacity: true)
        }
        blocks[text] = parsed
        return parsed
    }

    static func inline(_ text: String) -> AttributedString {
        if let cached = inlines[text] {
            return cached
        }
        let parsed = ChatMarkdown.inline(text)
        if inlines.count >= limit {
            inlines.removeAll(keepingCapacity: true)
        }
        inlines[text] = parsed
        return parsed
    }
}

private struct ChatMarkdownBlockView: View {
    let block: ChatMarkdownBlock
    let isStreaming: Bool

    private func inline(_ text: String) -> AttributedString {
        isStreaming ? ChatMarkdown.inline(text) : ChatMarkdownCache.inline(text)
    }

    var body: some View {
        switch block {
        case let .paragraph(text):
            Text(inline(text))
                .fixedSize(horizontal: false, vertical: true)
        case let .heading(level, text):
            Text(inline(text))
                .font(level <= 2 ? Font.headline : Font.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        case let .listItem(marker, depth, text):
            ChatMarkdownListItem(marker: marker, depth: depth, text: inline(text))
        case let .code(text):
            ChatMarkdownCode(text: text)
        case let .quote(text):
            ChatMarkdownQuote(text: inline(text))
        case .rule:
            Divider()
        }
    }
}

private struct ChatMarkdownListItem: View {
    let marker: String
    let depth: Int
    let text: AttributedString

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(marker)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, CGFloat(depth) * 16)
    }
}

private struct ChatMarkdownCode: View {
    let text: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(text)
                .font(.callout.monospaced())
                .padding(10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct ChatMarkdownQuote: View {
    let text: AttributedString

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 3)
            Text(text)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}
