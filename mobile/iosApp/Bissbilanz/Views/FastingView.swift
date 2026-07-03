import SwiftUI

enum FastingProtocolOption: String, CaseIterable, Identifiable {
    case sixteenEight
    case eighteenSix
    case twentyFour
    case custom

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .sixteenEight: "16:8"
        case .eighteenSix: "18:6"
        case .twentyFour: "20:4"
        case .custom: L10n.custom
        }
    }

    var fastingHours: Int? {
        switch self {
        case .sixteenEight: 16
        case .eighteenSix: 18
        case .twentyFour: 20
        case .custom: nil
        }
    }
}

struct FastingView: View {
    @Environment(FastingTimerManager.self) private var fastingManager

    @State private var selectedProtocol: FastingProtocolOption = .sixteenEight
    @State private var customHours = 16
    @State private var history: [FastingSession] = []
    @State private var showEndConfirmation = false

    private var targetHours: Int {
        selectedProtocol.fastingHours ?? customHours
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let session = fastingManager.session {
                    activeFastSection(session)
                } else {
                    startSection
                }

                if !fastingManager.liveActivitiesEnabled {
                    liveActivityHint
                }

                historySection
            }
            .padding()
        }
        .navigationTitle(L10n.fasting)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            fastingManager.refresh()
            history = FastingSessionStore.loadHistory()
        }
        // The lock-screen "End Fast" button can flip this from outside the
        // view — reload the history list when it does.
        .onChange(of: fastingManager.isFasting) { _, _ in
            history = FastingSessionStore.loadHistory()
        }
        .confirmationDialog(
            L10n.fastingEndConfirmation,
            isPresented: $showEndConfirmation,
            titleVisibility: .visible
        ) {
            Button(L10n.endFast, role: .destructive) {
                Task {
                    await fastingManager.stop()
                    history = FastingSessionStore.loadHistory()
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
        }
    }

    // MARK: - Active Fast

    private func activeFastSection(_ session: FastingSession) -> some View {
        VStack(spacing: 16) {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                let target = TimeInterval(session.targetHours) * 3600
                let progress = min(timeline.date.timeIntervalSince(session.startedAt) / max(target, 60), 1)
                ZStack {
                    Circle()
                        .stroke(MacroColors.fasting.opacity(0.15), lineWidth: 14)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(MacroColors.fasting, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 4) {
                        Text(timerInterval: session.elapsedRange, countsDown: false)
                            .font(.system(size: 38, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .multilineTextAlignment(.center)
                        Text(L10n.fastingOfTargetHours(session.targetHours))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if progress >= 1 {
                            Label(L10n.fastingTargetReached, systemImage: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }
                    .padding(24)
                }
                .frame(width: 250, height: 250)
            }
            .padding(.vertical, 8)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.fastingStarted)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(DateFormatting.timeString(from: session.startedAt))
                        .font(.headline)
                        .monospacedDigit()
                }
                Spacer()
                Menu {
                    ForEach([14, 16, 18, 20, 24, 36], id: \.self) { hours in
                        Button(L10n.fastingTargetHours(hours)) {
                            Task { await fastingManager.changeTarget(hours: hours) }
                        }
                    }
                } label: {
                    Label(L10n.fastingChangeTarget, systemImage: "slider.horizontal.3")
                        .font(.caption)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(L10n.fastingEnds)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(DateFormatting.timeString(from: session.targetEndDate))
                        .font(.headline)
                        .monospacedDigit()
                }
            }
            .padding(12)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                showEndConfirmation = true
            } label: {
                Text(L10n.endFast)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(MacroColors.fasting)
        }
    }

    // MARK: - Start

    private var startSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "timer")
                .font(.system(size: 40))
                .foregroundStyle(MacroColors.fasting)
                .padding(.top, 8)

            Text(L10n.fastingNotRunning)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Picker(L10n.fastingProtocol, selection: $selectedProtocol) {
                ForEach(FastingProtocolOption.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)

            if selectedProtocol == .custom {
                Picker(L10n.hours, selection: $customHours) {
                    ForEach(1 ..< 49) { hours in
                        Text("\(hours) h").tag(hours)
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 100)
                Text(L10n.fastingCustomDescription(customHours))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let fasting = selectedProtocol.fastingHours {
                Text(L10n.fastingProtocolDescription(fasting: fasting, eating: 24 - fasting))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                fastingManager.start(targetHours: targetHours)
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } label: {
                Text(L10n.startFast)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(MacroColors.fasting)
        }
        .padding(16)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Live Activity Hint

    private var liveActivityHint: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle")
                .foregroundStyle(.secondary)
            Text(L10n.fastingLiveActivityHint)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - History

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.history)
                .font(.subheadline)
                .fontWeight(.medium)

            if history.isEmpty {
                Text(L10n.fastingNoHistory)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(history.prefix(15))) { session in
                        historyRow(session)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func historyRow(_ session: FastingSession) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(DateFormatting.displayString(from: session.startedAt))
                    .font(.subheadline)
                Text(L10n.fastingTargetHours(session.targetHours))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(durationString(session.duration ?? 0))
                .font(.subheadline)
                .monospacedDigit()
            if session.reachedTarget {
                Image(systemName: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.green)
                    .accessibilityLabel(L10n.fastingTargetReached)
            }
        }
        .frame(minHeight: 44)
    }

    private func durationString(_ interval: TimeInterval) -> String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.hour, .minute]
        formatter.unitsStyle = .abbreviated
        return formatter.string(from: max(interval, 0)) ?? "0"
    }
}
