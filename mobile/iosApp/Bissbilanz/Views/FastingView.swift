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
    @State private var showEndConfirmation = false
    /// Nil means "now" — the start row shows a plain "Now" until the user
    /// back-dates the start, so a fast started on time carries no stale instant.
    @State private var customStart: Date?
    @State private var showAdjustStart = false
    @State private var editingSession: FastingSession?

    private var history: [FastingSession] {
        fastingManager.history
    }

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
        }
        .sheet(isPresented: $showAdjustStart) {
            if let session = fastingManager.session {
                FastingStartSheet(startedAt: session.startedAt) { newStart in
                    Task { await fastingManager.changeStart(newStart) }
                }
            }
        }
        .sheet(item: $editingSession) { session in
            FastingEditSheet(
                session: session,
                onSave: { fastingManager.updateHistory($0) },
                onDelete: { fastingManager.deleteHistory(id: session.id) }
            )
        }
        .confirmationDialog(
            L10n.fastingEndConfirmation,
            isPresented: $showEndConfirmation,
            titleVisibility: .visible
        ) {
            Button(L10n.endFast) {
                Task {
                    await fastingManager.stop()
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
            Button(L10n.fastingDiscard, role: .destructive) {
                Task {
                    await fastingManager.discard()
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
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
                Button {
                    showAdjustStart = true
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.fastingStarted)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 4) {
                            Text(startLabel(session.startedAt))
                                .font(.headline)
                                .monospacedDigit()
                            Image(systemName: "pencil")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.fastingAdjustStart)
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

            // Forgot to start the timer before bed? Back-date the start here;
            // the ring, the Live Activity and the history all count from it.
            HStack {
                Text(L10n.fastingStartedAt)
                    .font(.subheadline)
                Spacer()
                if let start = customStart {
                    DatePicker(
                        L10n.fastingStartedAt,
                        selection: Binding(
                            get: { start },
                            set: { customStart = min($0, Date()) }
                        ),
                        in: ...Date(),
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .labelsHidden()
                    Button {
                        customStart = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel(L10n.fastingStartNow)
                } else {
                    Button {
                        customStart = Date().addingTimeInterval(-3600)
                    } label: {
                        Label(L10n.fastingStartNow, systemImage: "pencil")
                            .font(.subheadline)
                    }
                }
            }
            .frame(minHeight: 44)

            Button {
                fastingManager.start(targetHours: targetHours, startedAt: customStart ?? Date())
                customStart = nil
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
                Text(L10n.fastingHistoryHint)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func historyRow(_ session: FastingSession) -> some View {
        Button {
            editingSession = session
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(DateFormatting.displayString(from: session.startedAt))
                        .font(.subheadline)
                    Text(historySubtitle(session))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(FastingFormatting.duration(session.duration ?? 0))
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
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                editingSession = session
            } label: {
                Label(L10n.edit, systemImage: "pencil")
            }
            Button(role: .destructive) {
                fastingManager.deleteHistory(id: session.id)
            } label: {
                Label(L10n.delete, systemImage: "trash")
            }
        }
    }

    private func historySubtitle(_ session: FastingSession) -> String {
        let target = L10n.fastingTargetHours(session.targetHours)
        guard let endedAt = session.endedAt else { return target }
        let start = DateFormatting.timeString(from: session.startedAt)
        let end = DateFormatting.timeString(from: endedAt)
        return "\(start) – \(end) · \(target)"
    }

    /// "21:00" when the fast started today, otherwise date + time.
    private func startLabel(_ startedAt: Date) -> String {
        if Calendar.current.isDateInToday(startedAt) {
            return DateFormatting.timeString(from: startedAt)
        }
        return startedAt.formatted(date: .abbreviated, time: .shortened)
    }
}

enum FastingFormatting {
    static func duration(_ interval: TimeInterval) -> String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.hour, .minute]
        formatter.unitsStyle = .abbreviated
        return formatter.string(from: max(interval, 0)) ?? "0"
    }
}

// MARK: - Adjust Start

/// Moves the running fast's start. A future instant is clamped by the picker
/// range, so the manager never sees a negative elapsed time.
struct FastingStartSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var startedAt: Date
    private let onSave: (Date) -> Void

    init(startedAt: Date, onSave: @escaping (Date) -> Void) {
        _startedAt = State(initialValue: startedAt)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(
                        L10n.fastingStartedAt,
                        selection: $startedAt,
                        in: ...Date(),
                        displayedComponents: [.date, .hourAndMinute]
                    )
                } footer: {
                    Text(L10n.fastingAdjustStartHint)
                }
            }
            .navigationTitle(L10n.fastingAdjustStart)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        onSave(min(startedAt, Date()))
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Edit History

/// Edits a finished fast: start, end and target. Validates the range itself
/// so the manager only ever stores an end after its start.
struct FastingEditSheet: View {
    @Environment(\.dismiss) private var dismiss

    private let session: FastingSession
    private let onSave: (FastingSession) -> Void
    private let onDelete: () -> Void

    @State private var startedAt: Date
    @State private var endedAt: Date
    @State private var targetHours: Int
    @State private var showDeleteConfirmation = false

    init(session: FastingSession, onSave: @escaping (FastingSession) -> Void, onDelete: @escaping () -> Void) {
        self.session = session
        self.onSave = onSave
        self.onDelete = onDelete
        _startedAt = State(initialValue: session.startedAt)
        _endedAt = State(initialValue: session.endedAt ?? Date())
        _targetHours = State(initialValue: session.targetHours)
    }

    private var isValid: Bool {
        endedAt > startedAt
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(
                        L10n.fastingStarted,
                        selection: $startedAt,
                        in: ...Date(),
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    DatePicker(
                        L10n.fastingEnded,
                        selection: $endedAt,
                        in: ...Date(),
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    Picker(L10n.fastingTarget, selection: $targetHours) {
                        ForEach(Array(Set([12, 14, 16, 18, 20, 24, 36, 48, targetHours])).sorted(), id: \.self) { hours in
                            Text(L10n.fastingTargetHours(hours)).tag(hours)
                        }
                    }
                } footer: {
                    if isValid {
                        Text(FastingFormatting.duration(endedAt.timeIntervalSince(startedAt)))
                    } else {
                        Text(L10n.fastingInvalidRange)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label(L10n.delete, systemImage: "trash")
                    }
                }
            }
            .navigationTitle(L10n.fastingEditFast)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        var updated = session
                        updated.startedAt = startedAt
                        updated.endedAt = endedAt
                        updated.targetHours = targetHours
                        onSave(updated)
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
            .confirmationDialog(L10n.delete, isPresented: $showDeleteConfirmation, titleVisibility: .hidden) {
                Button(L10n.delete, role: .destructive) {
                    onDelete()
                    dismiss()
                }
            }
        }
    }
}
