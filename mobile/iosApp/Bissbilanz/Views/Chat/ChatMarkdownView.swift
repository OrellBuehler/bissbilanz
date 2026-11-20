import SwiftUI

/// An assistant answer rendered natively: `ChatMarkdown` splits it into
/// blocks, `AttributedString(markdown:)` styles the inline parts (bold,
/// italic, inline code, links).
struct ChatMarkdownView: View {
    let text: String

    var body: some View {
        let blocks = ChatMarkdown.blocks(text)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                ChatMarkdownBlockView(block: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ChatMarkdownBlockView: View {
    let block: ChatMarkdownBlock

    var body: some View {
        switch block {
        case let .paragraph(text):
            Text(ChatMarkdown.inline(text))
                .fixedSize(horizontal: false, vertical: true)
        case let .heading(level, text):
            Text(ChatMarkdown.inline(text))
                .font(level <= 2 ? Font.headline : Font.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        case let .listItem(marker, depth, text):
            ChatMarkdownListItem(marker: marker, depth: depth, text: text)
        case let .code(text):
            ChatMarkdownCode(text: text)
        case let .quote(text):
            ChatMarkdownQuote(text: text)
        case .rule:
            Divider()
        }
    }
}

private struct ChatMarkdownListItem: View {
    let marker: String
    let depth: Int
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(marker)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(ChatMarkdown.inline(text))
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
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 3)
            Text(ChatMarkdown.inline(text))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}
