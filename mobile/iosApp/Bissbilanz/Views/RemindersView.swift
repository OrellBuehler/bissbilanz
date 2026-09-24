import SwiftUI
import UserNotifications

/// Logging reminders (weight/meal/sleep), plus a read-only list of
/// supplement reminders. The notification-permission banner and snooze
/// duration picker live here — moved from `SettingsView.supplementRemindersSection`,
/// which is now just a `NavigationLink` to this view.
struct RemindersView: View {
    @Environment(ReminderRepository.self) private var reminderRepository
    @Environment(SupplementRepository.self) private var supplementRepository
    @Environment(WeightRepository.self) private var weightRepository
    @Environment(SleepRepository.self) private var sleepRepository
    @Environment(EntryRepository.self) private var entryRepository

    @State private var reminders: [Reminder] = []
    @State private var supplements: [Supplement] = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var editingReminder: Reminder?
    @State private var notificationsAuthorized = true
    @State private var editingSupplement: Supplement?
    @State private var errorMessage: String?

    // Device-local, like SettingsView's own copy — how long a snooze lasts is a
    // property of the phone you're being reminded on, not something to sync.
    @AppStorage(SupplementReminderScheduler.snoozeMinutesKey)
    private var snoozeMinutes = SupplementReminderScheduler.defaultSnoozeMinutes

    private let kindIcons: [ReminderKind: String] = [
        .weight: "scalemass",
        .meal: "fork.knife",
        .sleep: "bed.double",
    ]

    private var supplementReminders: [Supplement] {
        supplements.filter { ($0.reminderTimes?.isEmpty ?? true) == false }
    }

    var body: some View {
        List {
            notificationsSection

            if isLoading {
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            } else if reminders.isEmpty {
                Section {
                    Text(L10n.remindersEmpty)
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }
            } else {
                Section {
                    ForEach(reminders) { reminder in
                        reminderRow(reminder)
                    }
                }
            }

            supplementRemindersSection
        }
        .navigationTitle(L10n.remindersTitle)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(L10n.remindersAdd)
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            ReminderEditSheet { saved in
                Task { await afterSave(isFirst: reminders.isEmpty, reminder: saved) }
            }
        }
        .sheet(item: $editingReminder) { reminder in
            ReminderEditSheet(reminder: reminder) { saved in
                Task { await afterSave(isFirst: false, reminder: saved) }
            }
        }
        .sheet(item: $editingSupplement) { supplement in
            SupplementEditSheet(supplement: supplement) { _ in
                Task { await loadData() }
            }
        }
        .refreshable { await loadData() }
        .task {
            await loadData()
            notificationsAuthorized = await SupplementReminderScheduler.authorizationStatus() == .authorized
        }
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    // MARK: - Notifications section

    private var notificationsSection: some View {
        Section {
            Picker(L10n.snoozeDuration, selection: $snoozeMinutes) {
                ForEach(SupplementReminderScheduler.snoozePresets, id: \.self) { minutes in
                    Text(
                        minutes >= 60 && minutes % 60 == 0
                            ? L10n.snoozeHours(minutes / 60)
                            : L10n.snoozeMinutes(minutes)
                    ).tag(minutes)
                }
            }
            .pickerStyle(.menu)

            if !notificationsAuthorized {
                Text(L10n.notificationsDisabled)
                    .font(.footnote)
                    .foregroundStyle(.red)
                Button(L10n.openSettings) {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
            }
        }
    }

    // MARK: - Reminder row

    private func reminderRow(_ reminder: Reminder) -> some View {
        HStack {
            Image(systemName: kindIcons[reminder.kind] ?? "bell")
                .font(.title3)
                .foregroundStyle(reminder.enabled ? Color.accentColor : .secondary)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(kindLabel(reminder))
                    .font(.body)
                Text(summary(reminder))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { reminder.enabled },
                set: { newValue in Task { await toggleEnabled(reminder, enabled: newValue) } }
            ))
            .labelsHidden()
            .accessibilityLabel(L10n.remindersEnabled)
        }
        .contentShape(Rectangle())
        .onTapGesture { editingReminder = reminder }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                Task { await delete(reminder) }
            } label: {
                Label(L10n.remindersDelete, systemImage: "trash")
            }

            Button {
                editingReminder = reminder
            } label: {
                Label(L10n.edit, systemImage: "pencil")
            }
            .tint(.orange)
        }
    }

    private func kindLabel(_ reminder: Reminder) -> String {
        switch reminder.kind {
        case .weight: L10n.remindersKindWeight
        case .sleep: L10n.remindersKindSleep
        case .meal: reminder.mealType ?? L10n.remindersKindMeal
        }
    }

    private func summary(_ reminder: Reminder) -> String {
        var parts = [reminder.time, weekdaysSummary(reminder.weekdays)]
        if reminder.kind == .meal, let mealType = reminder.mealType {
            parts.append(mealType)
        }
        return parts.joined(separator: " · ")
    }

    private func weekdaysSummary(_ weekdays: [Int]) -> String {
        guard weekdays.count < 7 else { return L10n.remindersEveryDay }
        let labels = L10n.supplementWeekdays
        return weekdays.sorted().compactMap { labels.indices.contains($0) ? labels[$0] : nil }
            .joined(separator: ", ")
    }

    // MARK: - Supplement reminders (read-only)

    private var supplementRemindersSection: some View {
        Section {
            if supplementReminders.isEmpty {
                Text(L10n.remindersSupplementsEmpty)
                    .foregroundStyle(.secondary)
                    .font(.footnote)
            } else {
                ForEach(supplementReminders) { supplement in
                    Button {
                        editingSupplement = supplement
                    } label: {
                        HStack {
                            Text(supplement.name)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text((supplement.reminderTimes ?? []).joined(separator: ", "))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } header: {
            Text(L10n.remindersSupplementsTitle)
        } footer: {
            Text(L10n.remindersSupplementsDesc)
        }
    }

    // MARK: - Actions

    private func loadData() async {
        isLoading = reminders.isEmpty
        defer { isLoading = false }
        try? await reminderRepository.refresh()
        reloadReminders()
        try? await supplementRepository.refresh()
        supplements = supplementRepository.supplements()
    }

    /// Time-ascending, matching the server list endpoint's own ordering.
    private func reloadReminders() {
        reminders = reminderRepository.reminders().sorted { $0.time < $1.time }
    }

    private func afterSave(isFirst: Bool, reminder: Reminder) async {
        reloadReminders()
        showCreateSheet = false
        editingReminder = nil
        if isFirst {
            notificationsAuthorized = await SupplementReminderScheduler.requestAuthorizationIfNeeded()
        }
        await refill()
    }

    private func toggleEnabled(_ reminder: Reminder, enabled: Bool) async {
        do {
            _ = try await reminderRepository.updateReminder(id: reminder.id, ReminderUpdate(enabled: enabled))
            reloadReminders()
            await refill()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func delete(_ reminder: Reminder) async {
        do {
            try await reminderRepository.deleteReminder(id: reminder.id)
            reloadReminders()
            await refill()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refill() async {
        await SupplementReminderScheduler.refill(
            supplementRepository: supplementRepository,
            reminders: ReminderScheduler.SchedulingDependencies(
                reminderRepository: reminderRepository,
                weightRepository: weightRepository,
                sleepRepository: sleepRepository,
                entryRepository: entryRepository
            )
        )
    }
}
