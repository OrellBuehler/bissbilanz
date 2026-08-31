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
///
/// `.supplementalActivityFamilies([.small])` opts the activity into the Apple
/// Watch Smart Stack. Without it watchOS synthesises a card from the app name
/// plus the Dynamic Island's compact leading/trailing views only — an icon, a
/// ring and an empty middle, with no way to tell what is running or for how
/// long. With it, `FastingLockScreenView` renders a wrist-sized layout for
/// `ActivityFamily.small` instead.
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
        .supplementalActivityFamilies([.small])
    }
}

struct FastingLockScreenView: View {
    @Environment(\.activityFamily) private var activityFamily

    let state: FastingActivityAttributes.ContentState

    private var strings: WidgetStrings {
        WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
    }

    var body: some View {
        switch activityFamily {
        case .small:
            watchLayout
        default:
            lockScreenLayout
        }
    }

    /// Apple Watch Smart Stack (`ActivityFamily.small`). Far less room than the
    /// lock screen, so it drops the End Fast button and the end-time footer and
    /// keeps what the card has to answer at a glance: that a fast is running,
    /// how long it has been running, and how much is left.
    private var watchLayout: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "timer")
                Text(strings.fasting)
                    .fontWeight(.semibold)
                Spacer(minLength: 4)
                Text(strings.fastingTarget(state.targetHours))
                    .foregroundStyle(.secondary)
            }
            .font(.caption2)
            .foregroundStyle(MacroColors.fasting)
            .lineLimit(1)
            Text(timerInterval: state.elapsedRange, countsDown: false)
                .font(.system(.title2, design: .rounded))
                .fontWeight(.semibold)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(spacing: 6) {
                ProgressView(timerInterval: state.progressRange, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(MacroColors.fasting)
                Text(timerInterval: state.progressRange, countsDown: true)
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 52, alignment: .trailing)
            }
        }
        .padding(.horizontal, 4)
    }

    private var lockScreenLayout: some View {
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
