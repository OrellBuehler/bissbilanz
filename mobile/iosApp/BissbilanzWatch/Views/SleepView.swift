import SwiftUI
import WatchKit

/// Sleep tab: a glance (last night's duration + quality) and a vertical slide
/// for logging sleep — duration and quality each on the Digital Crown.
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
            SleepLoggerView(startMinutes: sleep?.durationMinutes, startQuality: sleep?.quality)
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
                VStack(spacing: 3) {
                    Text(strings.qualityScore(sleep.quality))
                        .font(.footnote)
                        .monospacedDigit()
                    QualityBar(quality: sleep.quality)
                }
                .padding(.top, 2)
                .padding(.horizontal, 6)
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

/// Ten segments showing a 1–10 sleep-quality score. Segments are flexible, so
/// the bar fits the smallest watch as well as the largest instead of ten
/// fixed-size dots overflowing a 41mm screen.
private struct QualityBar: View {
    let quality: Double
    var height: CGFloat = 4

    private var filled: Int {
        min(max(Int(quality.rounded()), 0), 10)
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1 ... 10, id: \.self) { index in
                Capsule()
                    .fill(index <= filled ? MacroColors.fiber : Color.secondary.opacity(0.3))
                    .frame(height: height)
            }
        }
    }
}

/// Sleep logger: duration in 15-minute steps and quality on the app's real
/// 1–10 scale, both driven by the Digital Crown. Tapping a value moves crown
/// focus to it — the screen is far too small for ten tappable targets, and a
/// five-dot control could never express an odd score.
private struct SleepLoggerView: View {
    private enum CrownField: Hashable {
        case duration
        case quality
    }

    @Environment(WatchConnectivityManager.self) private var connectivity

    @State private var minutes: Double
    @State private var quality: Double
    @State private var isLogging = false
    @State private var didFinish = false
    @FocusState private var focusedField: CrownField?

    init(startMinutes: Int?, startQuality: Double?) {
        _minutes = State(initialValue: Double(startMinutes ?? 450))
        _quality = State(initialValue: min(max((startQuality ?? 7).rounded(), 1), 10))
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
                    .focused($focusedField, equals: .duration)
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
                    Text(strings.qualityScore(quality))
                        .font(.system(size: 28, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .focusable()
                        .focused($focusedField, equals: .quality)
                        .digitalCrownRotation(
                            $quality,
                            from: 1,
                            through: 10,
                            by: 1,
                            sensitivity: .low,
                            isContinuous: false,
                            isHapticFeedbackEnabled: true
                        )
                    QualityBar(quality: quality, height: 5)
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
        .onAppear { focusedField = .duration }
    }

    private func log() {
        isLogging = true
        let request = WatchSleepLogRequest(
            durationMinutes: Int(minutes),
            quality: quality.rounded(),
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
