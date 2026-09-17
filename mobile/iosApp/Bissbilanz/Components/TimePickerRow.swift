import SwiftUI

/// A form row that edits a time — optionally a date and time — with the wheels
/// laid out inside the form instead of the system's compact popover.
///
/// The compact `DatePicker` hands its wheels to a floating overlay and only
/// writes the binding once a wheel has come to rest. Dismissing that overlay the
/// way everybody dismisses it — a tap outside — tears it down straight away, so
/// a minute the user had just spun onto but not yet let settle is dropped and the
/// row snaps back to the time it showed before. Minutes are the wheel people
/// flick hardest, which is why they lose those most often. Keeping the wheels in
/// the form removes the overlay, and with it the window in which a selection can
/// go missing: every stop writes straight through to the binding, in view.
struct TimePickerRow: View {
    private let label: String?
    @Binding private var selection: Date
    private let caption: String?
    private let range: ClosedRange<Date>?
    private let components: DatePickerComponents

    @State private var isExpanded = false

    init(
        _ label: String? = nil,
        selection: Binding<Date>,
        caption: String? = nil,
        in range: ClosedRange<Date>? = nil,
        displayedComponents components: DatePickerComponents = .hourAndMinute
    ) {
        self.label = label
        _selection = selection
        self.caption = caption
        self.range = range
        self.components = components
    }

    /// What the collapsed row shows — the same text the compact picker's chip
    /// would, so the row still reads as the value it edits.
    private var valueText: String {
        guard components.contains(.date) else { return DateFormatting.timeString(from: selection) }
        return "\(DateFormatting.displayString(from: selection)), \(DateFormatting.timeString(from: selection))"
    }

    var body: some View {
        Button {
            withAnimation(.snappy) { isExpanded.toggle() }
        } label: {
            HStack {
                if let label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label)
                            .foregroundStyle(.primary)
                        if let caption {
                            Text(caption)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 8)
                }
                valueChip
                if label == nil { Spacer(minLength: 0) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label ?? valueText)
        .accessibilityValue(valueText)

        if isExpanded {
            picker
                .datePickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: .infinity)
        }
    }

    /// Mimics the compact picker's tinted chip so the row keeps looking tappable.
    private var valueChip: some View {
        Text(valueText)
            .monospacedDigit()
            .foregroundStyle(isExpanded ? Color.accentColor : Color.primary)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(
                Color(.tertiarySystemFill),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
    }

    @ViewBuilder
    private var picker: some View {
        if let range {
            DatePicker(label ?? "", selection: $selection, in: range, displayedComponents: components)
        } else {
            DatePicker(label ?? "", selection: $selection, displayedComponents: components)
        }
    }
}
