import SwiftUI

/// Collapsible container for one insight card — the counterpart of Android's
/// `CollapsibleCard`, down to the `insights.<sectionId>.collapsed` preference key,
/// so a section the user folded away stays folded on both platforms.
struct InsightCardView<Content: View>: View {
    let title: String
    let sectionId: String
    private let content: Content

    @AppStorage private var collapsed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(title: String, sectionId: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.sectionId = sectionId
        self.content = content()
        _collapsed = AppStorage(wrappedValue: false, "insights.\(sectionId).collapsed")
    }

    var body: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    if reduceMotion {
                        collapsed.toggle()
                    } else {
                        withAnimation(.easeInOut(duration: 0.2)) { collapsed.toggle() }
                    }
                } label: {
                    HStack {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .rotationEffect(.degrees(collapsed ? -90 : 0))
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(title)
                .accessibilityHint(collapsed ? L10n.foodDetailExpand : L10n.foodDetailCollapse)

                if !collapsed {
                    content
                }
            }
        }
    }
}

/// The "not enough data yet" body every card falls back to.
///
/// The shared analytics never return nil on thin data — they return a zeroed
/// result stamped `ConfidenceLevel.insufficient` — so this is what a card shows
/// for that, matching Android's `insights_not_enough_data`.
struct InsightEmptyState: View {
    var message: String = L10n.insightsNotEnoughData

    var body: some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Hero number every card leads with: one large value plus its caption.
struct InsightHeadline: View {
    let value: String
    let caption: String
    var tint: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.title, design: .rounded, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(caption)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Label/value line — the detail rows under a card's headline.
struct InsightRow: View {
    let label: String
    let value: String
    var tint: Color = .primary

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(tint)
        }
    }
}

/// Trailing explanatory line, e.g. what a card's sample size was.
struct InsightFootnote: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A secondary figure beside the headline — cards that show two numbers side by
/// side (mean/stddev, avg per meal / meals below threshold) use a pair of these.
struct InsightStat: View {
    let value: String
    let caption: String
    var tint: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.headline)
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(caption)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
