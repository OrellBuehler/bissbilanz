import SwiftUI

/// A form row that edits a time — optionally a date and time — with the wheels
/// laid out inside the form instead of the system's compact popover.
///
/// The hour and minute wheels are plain integer `Picker`s, each writing only its
/// own field straight into the binding the moment it changes. The system
/// `DatePicker` wheel, compact or inline, reports a value only when its UIKit
/// control fires, and that was observed to leave the binding (and the row's
/// label) on the old time while the wheel showed the new one.
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
            VStack(spacing: 0) {
                if components.contains(.date) {
                    dayPicker
                }
                clockWheels
            }
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

    private var clock: DateComponents {
        Calendar.current.dateComponents([.hour, .minute], from: selection)
    }

    private func commit(_ value: Date) {
        guard let range else {
            selection = value
            return
        }
        selection = min(max(value, range.lowerBound), range.upperBound)
    }

    private var hourBinding: Binding<Int> {
        Binding(
            get: { clock.hour ?? 0 },
            set: { commit(DateFormatting.replacingClock(of: selection, hour: $0)) }
        )
    }

    private var minuteBinding: Binding<Int> {
        Binding(
            get: { clock.minute ?? 0 },
            set: { commit(DateFormatting.replacingClock(of: selection, minute: $0)) }
        )
    }

    private var dayBinding: Binding<Date> {
        Binding(
            get: { selection },
            set: { commit(DateFormatting.replacingDay(of: selection, with: $0)) }
        )
    }

    @ViewBuilder
    private var dayPicker: some View {
        Group {
            if let range {
                DatePicker("", selection: dayBinding, in: range, displayedComponents: .date)
            } else {
                DatePicker("", selection: dayBinding, displayedComponents: .date)
            }
        }
        .datePickerStyle(.wheel)
        .labelsHidden()
    }

    private var clockWheels: some View {
        HStack(spacing: 0) {
            Picker("", selection: hourBinding) {
                ForEach(0 ..< 24, id: \.self) { hour in
                    Text(String(format: "%02d", hour)).monospacedDigit().tag(hour)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .frame(maxWidth: .infinity)
            .clipped()

            Text(":")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.secondary)

            Picker("", selection: minuteBinding) {
                ForEach(0 ..< 60, id: \.self) { minute in
                    Text(String(format: "%02d", minute)).monospacedDigit().tag(minute)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .frame(maxWidth: .infinity)
            .clipped()
        }
        .frame(height: 150)
    }
}
