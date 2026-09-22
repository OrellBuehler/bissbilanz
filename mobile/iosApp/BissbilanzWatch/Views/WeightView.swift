import SwiftUI
import WatchKit

/// Weight tab: a single glance (latest weight + 7-day trend). Logging opens
/// as a sheet from the toolbar, seeded from the latest weight.
struct WeightView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    @State private var isLogging = false

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var weight: WatchWeightInfo {
        connectivity.state.weight ?? .empty
    }

    var body: some View {
        glance
            .navigationTitle(strings.weight)
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
                    WeightLoggerView(startKg: weight.latestKg)
                }
            }
    }

    @ViewBuilder
    private var glance: some View {
        if let latest = weight.latestKg {
            VStack(spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(Self.format(latest))
                        .font(.system(size: 48, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("kg")
                        .font(.system(.title3, design: .rounded))
                        .foregroundStyle(.secondary)
                }

                if let delta = weight.delta7dKg {
                    VStack(spacing: 1) {
                        Label(strings.signedKg(delta), systemImage: Self.trendIcon(delta))
                            .font(.system(.body, design: .rounded))
                            .fontWeight(.medium)
                            .monospacedDigit()
                            .foregroundStyle(delta < 0 ? MacroColors.fiber : .secondary)
                        Text(strings.sevenDayTrend)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ContentUnavailableView(strings.noWeight, systemImage: "scalemass")
        }
    }

    fileprivate static func format(_ kg: Double) -> String {
        String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), kg)
    }

    private static func trendIcon(_ delta: Double) -> String {
        delta < 0 ? "arrow.down.right" : (delta > 0 ? "arrow.up.right" : "arrow.right")
    }
}

/// Digital-Crown weight logger. Seeds from the latest known weight so a small
/// adjustment is all most weigh-ins need.
private struct WeightLoggerView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity
    @Environment(\.dismiss) private var dismiss

    @State private var kg: Double
    @State private var isLogging = false
    @FocusState private var crownFocused: Bool

    init(startKg: Double?) {
        let seed = startKg ?? 75
        _kg = State(initialValue: (seed * 10).rounded() / 10)
    }

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    var body: some View {
        CrownValue(value: WeightView.format(kg), caption: "kg", size: 52)
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
            .frame(maxHeight: .infinity)
            .navigationTitle(strings.weight)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ConfirmButton(isLogging: isLogging, label: strings.log, action: log)
                }
            }
            .sensoryFeedback(.increase, trigger: kg)
            .onAppear { crownFocused = true }
    }

    private func log() {
        isLogging = true
        let request = WatchWeightLogRequest(
            weightKg: kg,
            date: WidgetSnapshotStore.isoDateString(from: Date()),
            requestId: UUID().uuidString
        )
        Task {
            let outcome = await connectivity.logWeight(request)
            isLogging = false
            switch outcome {
            case .confirmed, .queued:
                WKInterfaceDevice.current().play(.success)
                dismiss()
            case .failed:
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }
}
