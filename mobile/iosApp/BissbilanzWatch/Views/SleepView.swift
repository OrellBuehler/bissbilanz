import SwiftUI
import WatchKit

/// Sleep tab: a single glance (last night's duration + quality). Logging opens
/// as a sheet from the toolbar — duration and quality each on the Digital Crown.
struct SleepView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    @State private var isLogging = false

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var sleep: WatchSleepInfo? {
        connectivity.state.sleep
    }

    var body: some View {
        VStack(spacing: 4) {
            glance
            PendingLogsLabel()
        }
        .navigationTitle(strings.sleep)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isLogging = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(strings.log)
            }
        }
        .sheet(isPresented: $isLogging) {
            NavigationStack {
                SleepLoggerView(startMinutes: sleep?.durationMinutes, startQuality: sleep?.quality)
            }
        }
    }

    @ViewBuilder
    private var glance: some View {
        if let sleep {
            VStack(spacing: 8) {
                VStack(spacing: 0) {
                    Text(strings.sleepDuration(sleep.durationMinutes))
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(strings.lastNight)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 4) {
                    HStack {
                        Text(strings.quality)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(strings.qualityScore(sleep.quality))
                            .monospacedDigit()
                    }
                    .font(.footnote)
                    QualityBar(quality: sleep.quality)
                }
                .padding(.horizontal, 8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ContentUnavailableView(strings.noSleep, systemImage: "moon.zzz")
        }
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
                    .fill(index <= filled ? Color.indigo : Color.secondary.opacity(0.3))
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
    @Environment(\.dismiss) private var dismiss

    @State private var minutes: Double
    @State private var quality: Double
    @State private var isLogging = false
    @State private var didFail = false
    @FocusState private var focusedField: CrownField?

    init(startMinutes: Int?, startQuality: Double?) {
        _minutes = State(initialValue: Double(startMinutes ?? 450))
        _quality = State(initialValue: min(max((startQuality ?? 7).rounded(), 1), 10))
    }

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    var body: some View {
        VStack(spacing: 8) {
            Text(strings.sleepDuration(Int(minutes)))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
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
                HStack {
                    Text(strings.quality)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(strings.qualityScore(quality))
                        .monospacedDigit()
                }
                .font(.footnote)
                QualityBar(quality: quality, height: 5)
            }
            .padding(8)
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

            if didFail {
                LogFailedText(strings: strings)
            }
        }
        .frame(maxHeight: .infinity)
        .navigationTitle(strings.sleep)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ConfirmButton(isLogging: isLogging, label: strings.log, action: log)
            }
        }
        .sensoryFeedback(.increase, trigger: minutes)
        .sensoryFeedback(.selection, trigger: quality)
        .onAppear { focusedField = .duration }
    }

    private func log() {
        isLogging = true
        didFail = false
        let request = WatchSleepLogRequest(
            durationMinutes: Int(minutes),
            quality: quality.rounded(),
            date: WidgetSnapshotStore.isoDateString(from: Date()),
            requestId: UUID().uuidString
        )
        Task {
            let outcome = await connectivity.logSleep(request)
            isLogging = false
            WKInterfaceDevice.current().play(outcome.haptic)
            if outcome == .failed {
                didFail = true
            } else {
                dismiss()
            }
        }
    }
}
