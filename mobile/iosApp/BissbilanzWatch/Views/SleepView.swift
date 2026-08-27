import SwiftUI
import WatchKit

/// Sleep tab: a glance (last night's duration + quality) and a vertical slide
/// for logging sleep — duration on the Digital Crown, quality as five dots.
struct SleepView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var sleep: WatchSleepInfo? {
        connectivity.state.sleep
    }

    var body: some View {
        TabView {
            glance
            SleepLoggerView(startMinutes: sleep?.durationMinutes)
        }
        .tabViewStyle(.verticalPage)
    }

    private var glance: some View {
        VStack(spacing: 6) {
            Text(strings.sleep)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let sleep {
                Text(strings.lastNight)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(strings.sleepDuration(sleep.durationMinutes))
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                QualityDots(quality: Int(sleep.quality.rounded()))
                    .padding(.top, 2)
            } else {
                Text(strings.noSleep)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Five dots showing a 0–5 sleep-quality score.
private struct QualityDots: View {
    let quality: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(1 ... 5, id: \.self) { index in
                Circle()
                    .fill(index <= quality ? MacroColors.fiber : Color.secondary.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
    }
}

/// Sleep logger: duration via the Digital Crown (15-minute steps), quality via
/// five tappable dots.
private struct SleepLoggerView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    @State private var minutes: Double
    @State private var quality: Int = 3
    @State private var isLogging = false
    @State private var didFinish = false
    @FocusState private var crownFocused: Bool

    init(startMinutes: Int?) {
        _minutes = State(initialValue: Double(startMinutes ?? 450))
    }

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(strings.sleep)
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Text(strings.sleepDuration(Int(minutes)))
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .focusable()
                    .focused($crownFocused)
                    .digitalCrownRotation(
                        $minutes,
                        from: 0,
                        through: 720,
                        by: 15,
                        sensitivity: .medium,
                        isContinuous: false,
                        isHapticFeedbackEnabled: true
                    )

                VStack(spacing: 4) {
                    Text(strings.quality)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 6) {
                        ForEach(1 ... 5, id: \.self) { index in
                            Button {
                                quality = index
                            } label: {
                                Circle()
                                    .fill(index <= quality ? MacroColors.fiber : Color.secondary.opacity(0.3))
                                    .frame(width: 16, height: 16)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Button(action: log) {
                    if isLogging {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(strings.log)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                }
                .tint(MacroColors.calories)
                .disabled(isLogging)
            }
            .padding(.vertical, 4)
        }
        .sensoryFeedback(.increase, trigger: minutes)
        .sensoryFeedback(.selection, trigger: quality)
        .sensoryFeedback(.success, trigger: didFinish)
        .onAppear { crownFocused = true }
    }

    private func log() {
        isLogging = true
        let request = WatchSleepLogRequest(
            durationMinutes: Int(minutes),
            quality: Double(quality),
            date: WidgetSnapshotStore.isoDateString(from: Date()),
            requestId: UUID().uuidString
        )
        Task {
            let outcome = await connectivity.logSleep(request)
            isLogging = false
            switch outcome {
            case .confirmed, .queued:
                didFinish = true
            case .failed:
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }
}
