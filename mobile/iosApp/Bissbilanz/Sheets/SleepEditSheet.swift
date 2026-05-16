import SwiftUI

struct SleepEditSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let existingEntry: SleepEntry?
    let onSaved: () -> Void

    @State private var entryDate = Date()
    @State private var durationHours = 7
    @State private var durationMinutes = 30
    @State private var quality = 7
    @State private var hasBedtime = false
    @State private var bedtime = Calendar.current.date(bySettingHour: 23, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var hasWakeTime = false
    @State private var wakeTime = Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var hasWakeUps = false
    @State private var wakeUps = 0
    @State private var notes = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(existingEntry: SleepEntry? = nil, onSaved: @escaping () -> Void) {
        self.existingEntry = existingEntry
        self.onSaved = onSaved
    }

    private var isValid: Bool {
        durationHours > 0 || durationMinutes > 0
    }

    private var totalDurationMinutes: Int {
        durationHours * 60 + durationMinutes
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(L10n.today, selection: $entryDate, displayedComponents: .date)
                }

                Section(L10n.sleepDuration) {
                    Stepper(value: $durationHours, in: 0 ... 23) {
                        HStack {
                            Text(L10n.sleepDuration)
                            Spacer()
                            Text("\(durationHours)h")
                                .foregroundStyle(.secondary)
                        }
                    }
                    Stepper(value: $durationMinutes, in: 0 ... 59, step: 5) {
                        HStack {
                            Text(L10n.minutes)
                            Spacer()
                            Text("\(durationMinutes)m")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section(L10n.sleepQuality) {
                    Stepper(value: $quality, in: 1 ... 10) {
                        HStack {
                            Text(L10n.sleepQuality)
                            Spacer()
                            Text("\(quality) / 10")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section(L10n.bedtime) {
                    Toggle(L10n.bedtime, isOn: $hasBedtime)
                    if hasBedtime {
                        DatePicker(L10n.bedtime, selection: $bedtime, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                    }
                }

                Section(L10n.wakeTime) {
                    Toggle(L10n.wakeTime, isOn: $hasWakeTime)
                    if hasWakeTime {
                        DatePicker(L10n.wakeTime, selection: $wakeTime, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                    }
                }

                Section(L10n.wakeUps) {
                    Toggle(L10n.wakeUps, isOn: $hasWakeUps)
                    if hasWakeUps {
                        Stepper(value: $wakeUps, in: 0 ... 20) {
                            HStack {
                                Text(L10n.wakeUps)
                                Spacer()
                                Text("\(wakeUps)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section(L10n.notes) {
                    TextField(L10n.notes, text: $notes, axis: .vertical)
                        .lineLimit(3 ... 6)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(existingEntry != nil ? L10n.editSleep : L10n.addSleep)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(!isValid || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        guard let entry = existingEntry else { return }
        if let d = DateFormatting.date(from: entry.entryDate) {
            entryDate = d
        }
        durationHours = entry.durationMinutes / 60
        durationMinutes = entry.durationMinutes % 60
        quality = entry.quality
        notes = entry.notes ?? ""

        if let bedtimeStr = entry.bedtime,
           let parsed = parseISO(bedtimeStr)
        {
            hasBedtime = true
            bedtime = parsed
        }
        if let wakeTimeStr = entry.wakeTime,
           let parsed = parseISO(wakeTimeStr)
        {
            hasWakeTime = true
            wakeTime = parsed
        }
        if let wu = entry.wakeUps {
            hasWakeUps = true
            wakeUps = wu
        }
    }

    private func parseISO(_ string: String) -> Date? {
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: string) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: string)
    }

    private func save() async {
        guard isValid else { return }
        isSaving = true
        errorMessage = nil

        let dateStr = DateFormatting.isoString(from: entryDate)
        let iso = ISO8601DateFormatter()
        let bedtimeStr = hasBedtime ? iso.string(from: bedtime) : nil
        let wakeTimeStr = hasWakeTime ? iso.string(from: wakeTime) : nil

        do {
            if let existing = existingEntry {
                let update = SleepUpdate(
                    entryDate: dateStr,
                    durationMinutes: totalDurationMinutes,
                    quality: quality,
                    bedtime: bedtimeStr,
                    wakeTime: wakeTimeStr,
                    wakeUps: hasWakeUps ? wakeUps : nil,
                    notes: notes.isEmpty ? nil : notes
                )
                _ = try await api.updateSleepEntry(id: existing.id, update)
            } else {
                let create = SleepCreate(
                    entryDate: dateStr,
                    durationMinutes: totalDurationMinutes,
                    quality: quality,
                    bedtime: bedtimeStr,
                    wakeTime: wakeTimeStr,
                    wakeUps: hasWakeUps ? wakeUps : nil,
                    notes: notes.isEmpty ? nil : notes
                )
                _ = try await api.createSleepEntry(create)
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
