import SwiftUI

struct SectionTitle<Trailing: View>: View {
    let title: String
    let trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.brand(.title3, weight: .bold))
                .foregroundStyle(Brand.text)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension SectionTitle where Trailing == EmptyView {
    init(_ title: String) {
        self.init(title) { EmptyView() }
    }
}

struct CardHeader<Trailing: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    let trailing: Trailing

    init(
        _ title: String,
        systemImage: String,
        tint: Color = Brand.accent,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.systemImage = systemImage
        self.tint = tint
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 10) {
            IconTile(systemImage: systemImage, tint: tint, size: 30)
            Text(title)
                .font(.brand(.headline, weight: .semibold))
                .foregroundStyle(Brand.text)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension CardHeader where Trailing == EmptyView {
    init(_ title: String, systemImage: String, tint: Color = Brand.accent) {
        self.init(title, systemImage: systemImage, tint: tint) { EmptyView() }
    }
}
