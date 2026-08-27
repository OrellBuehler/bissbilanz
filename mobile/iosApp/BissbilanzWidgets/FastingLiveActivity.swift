import ActivityKit
import SwiftUI
import WidgetKit

/// Lock-screen banner + Dynamic Island for a running fast. All timers are
/// date-relative (`Text(timerInterval:)` / `ProgressView(timerInterval:)`),
/// so iOS advances them on-device with no running app process and no push —
/// see `FastingActivityAttributes`. The "End Fast" button runs
/// `EndFastIntent` in the app's process straight from the lock screen.
///
/// Date-relative `ProgressView`s ignore custom `ProgressViewStyle`s, so only
/// the built-in `.linear`/`.circular` styles are used here.
struct FastingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FastingActivityAttributes.self) { context in
            FastingLockScreenView(state: context.state)
        } dynamicIsland: { context in
            let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(strings.elapsed)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(timerInterval: context.state.elapsedRange, countsDown: false)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(strings.remaining)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(timerInterval: context.state.progressRange, countsDown: true)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 72, alignment: .trailing)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        ProgressView(timerInterval: context.state.progressRange, countsDown: false) {
                            EmptyView()
                        } currentValueLabel: {
                            EmptyView()
                        }
                        .tint(MacroColors.fasting)
                        Button(intent: EndFastIntent()) {
                            Text(strings.endFast)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(MacroColors.fasting)
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(MacroColors.fasting)
            } compactTrailing: {
                ProgressView(timerInterval: context.state.progressRange, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.circular)
                .tint(MacroColors.fasting)
            } minimal: {
                ProgressView(timerInterval: context.state.progressRange, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.circular)
                .tint(MacroColors.fasting)
            }
            .keylineTint(MacroColors.fasting)
        }
    }
}

struct FastingLockScreenView: View {
    let state: FastingActivityAttributes.ContentState

    private var strings: WidgetStrings {
        WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Label(strings.fasting, systemImage: "timer")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(MacroColors.fasting)
                Spacer()
                Text(strings.fastingTarget(state.targetHours))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Text(timerInterval: state.elapsedRange, countsDown: false)
                    .font(.system(.title, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                Spacer()
                Button(intent: EndFastIntent()) {
                    Text(strings.endFast)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(MacroColors.fasting)
            }
            ProgressView(timerInterval: state.progressRange, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                HStack {
                    Text(strings.fastingEndsAt(state.targetEndDate))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(timerInterval: state.progressRange, countsDown: true)
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 64, alignment: .trailing)
                }
            }
            .tint(MacroColors.fasting)
        }
        .padding()
    }
}
