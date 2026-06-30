import SwiftUI
import WatchKit

/// Weight tab: a glance (latest weight + 7-day trend) and a vertical slide for
/// logging today's weight with the Digital Crown.
struct WeightView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var weight: WatchWeightInfo {
        connectivity.state.weight ?? .empty
    }

    var body: some View {
        TabView {
            glance
            WeightLoggerView(startKg: weight.latestKg)
        }
        .tabViewStyle(.verticalPage)
    }

    private var glance: some View {
        VStack(spacing: 6) {
            Text(strings.weight)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let latest = weight.latestKg {
                Text(String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), latest))
                    .font(.system(size: 46, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                Text("kg")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let delta = weight.delta7dKg {
                    HStack(spacing: 4) {
                        Image(systemName: delta < 0 ? "arrow.down" : (delta > 0 ? "arrow.up" : "minus"))
                        Text(strings.signedKg(delta))
                            .monospacedDigit()
                    }
                    .font(.footnote)
                    .foregroundStyle(delta < 0 ? MacroColors.fiber : .secondary)
                    .padding(.top, 2)
                    Text(strings.sevenDayTrend)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text(strings.noWeight)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Digital-Crown weight logger. Seeds from the latest known weight so a small
/// adjustment is all most weigh-ins need.
private struct WeightLoggerView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    @State private var kg: Double
    @State private var isLogging = false
    @State private var didFinish = false
    @FocusState private var crownFocused: Bool

    init(startKg: Double?) {
        let seed = startKg ?? 75
        _kg = State(initialValue: (seed * 10).rounded() / 10)
    }

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    var body: some View {
        VStack(spacing: 8) {
            Text(strings.weight)
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text(String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), kg))
                .font(.system(size: 48, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .focusable()
                .focused($crownFocused)
                .digitalCrownRotation(
                    $kg,
                    from: 30,
                    through: 250,
                    by: 0.1,
                    sensitivity: .low,
                    isContinuous: false,
                    isHapticFeedbackEnabled: true
                )
                .overlay(alignment: .bottom) {
                    Text("kg")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .offset(y: 14)
                }
                .padding(.bottom, 14)

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
        .sensoryFeedback(.increase, trigger: kg)
        .sensoryFeedback(.success, trigger: didFinish)
        .onAppear { crownFocused = true }
    }

    private func log() {
        isLogging = true
        let request = WatchWeightLogRequest(
            weightKg: kg,
            date: WidgetSnapshotStore.isoDateString(from: Date())
        )
        Task {
            let outcome = await connectivity.logWeight(request)
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
