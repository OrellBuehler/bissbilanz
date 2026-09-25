import SwiftUI

struct ReminderEditSheet: View {
    @Environment(ReminderRepository.self) private var reminderRepository
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let existingReminder: Reminder?
    let onSaved: (Reminder) -> Void

    @State private var kind: ReminderKind = .weight
    @State private var mealType = ""
    @State private var time = Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var weekdays: Set<Int> = Set(0 ... 6)
    @State private var enabled = true
    @State private var mealTypes: [String] = WidgetSnapshotWriter.standardMealTypes
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var weekdayLabels: [String] {
        L10n.supplementWeekdays
    }

    init(reminder: Reminder? = nil, onSaved: @escaping (Reminder) -> Void = { _ in }) {
        existingReminder = reminder
        self.onSaved = onSaved
        if let reminder {
            _kind = State(initialValue: reminder.kind)
            _mealType = State(initialValue: reminder.mealType ?? "")
            _weekdays = State(initialValue: Set(reminder.weekdays))
            _enabled = State(initialValue: reminder.enabled)
            if let parsed = SupplementSchedule.parseTime(reminder.time) {
                let date = Calendar.current.date(
                    bySettingHour: parsed.hour, minute: parsed.minute, second: 0, of: Date()
                )
                if let date {
                    _time = State(initialValue: date)
                }
            }
        }
    }

    private var isValid: Bool {
        !weekdays.isEmpty && (kind != .meal || !mealType.isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L10n.remindersKind, selection: $kind) {
                        Text(L10n.remindersKindWeight).tag(ReminderKind.weight)
                        Text(L10n.remindersKindMeal).tag(ReminderKind.meal)
                        Text(L10n.remindersKindSleep).tag(ReminderKind.sleep)
                    }

                    if kind == .meal {
                        Picker(L10n.remindersMealType, selection: $mealType) {
                            ForEach(mealTypes, id: \.self) { name in
                                Text(name).tag(name)
                            }
                        }
                    }

                    TimePickerRow(L10n.remindersTime, selection: $time)
                }

                Section(L10n.remindersWeekdays) {
                    HStack {
                        ForEach(0 ..< 7, id: \.self) { day in
                            Button {
                                if weekdays.contains(day) {
                                    weekdays.remove(day)
                                } else {
                                    weekdays.insert(day)
                                }
                            } label: {
                                Text(weekdayLabels[day])
                                    .font(.caption2)
                                    .frame(maxWidth: .infinity, minHeight: 36)
                                    .background(weekdays.contains(day) ? Color.accentColor : Color.clear)
                                    .foregroundStyle(weekdays.contains(day) ? .white : .primary)
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                    .contentShape(RoundedRectangle(cornerRadius: 6))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if showsHealthKitHint {
                    Section {
                        Label(L10n.remindersHealthKitHint, systemImage: "heart.text.square")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Toggle(L10n.remindersEnabled, isOn: $enabled)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(existingReminder == nil ? L10n.remindersAdd : L10n.remindersEdit)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.remindersSave) {
                        Task { await save() }
                    }
                    .disabled(!isValid || isSaving)
                }
            }
            .task {
                await loadMealTypes()
            }
        }
    }

    /// Weight/sleep reminders are redundant once the matching Apple Health
    /// import is already logging the day automatically.
    private var showsHealthKitHint: Bool {
        switch kind {
        case .weight: UserDefaults.standard.bool(forKey: HealthKitService.syncEnabledKey)
        case .sleep: UserDefaults.standard.bool(forKey: HealthKitService.readSleepEnabledKey)
        case .meal: false
        }
    }

    private func loadMealTypes() async {
        let custom = (try? await api.getMealTypes())?.map(\.name) ?? []
        let combined = WidgetSnapshotWriter.standardMealTypes + custom.filter {
            !WidgetSnapshotWriter.standardMealTypes.contains($0)
        }
        mealTypes = combined
        if mealType.isEmpty {
            mealType = combined.first ?? ""
        }
    }

    private func timeString() -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: time)
        return String(format: "%02d:%02d", components.hour ?? 8, components.minute ?? 0)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let saved: Reminder
            if let existingReminder {
                saved = try await reminderRepository.updateReminder(
                    id: existingReminder.id,
                    ReminderUpdate(
                        kind: kind,
                        // Explicitly wrapped: the form always knows the full
                        // desired state, so this is never "leave it alone" —
                        // see `ReminderUpdate.mealType`'s doc.
                        mealType: .some(kind == .meal ? mealType : nil),
                        time: timeString(),
                        weekdays: Array(weekdays).sorted(),
                        enabled: enabled
                    )
                )
            } else {
                saved = try await reminderRepository.createReminder(ReminderCreate(
                    kind: kind,
                    mealType: kind == .meal ? mealType : nil,
                    time: timeString(),
                    weekdays: Array(weekdays).sorted(),
                    enabled: enabled
                ))
            }
            onSaved(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
