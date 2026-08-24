import SwiftUI
import UserNotifications

struct SupplementEditSheet: View {
    @Environment(SupplementRepository.self) private var supplementRepository
    @Environment(\.dismiss) private var dismiss

    let existingSupplement: Supplement?
    let onSaved: (Supplement) -> Void

    @State private var name = ""
    @State private var scheduleType: ScheduleType = .daily
    @State private var scheduleDays: Set<Int> = []
    @State private var timeOfDay = "anytime"
    @State private var reminderTimes: [String] = []
    @State private var notificationsAuthorized = true
    @State private var isActive = true
    @State private var ingredientRows: [IngredientInputRow] = [IngredientInputRow()]
    @State private var isSaving = false
    @State private var errorMessage: String?

    struct IngredientInputRow: Identifiable {
        let id = UUID()
        var name: String = ""
        var dosage: String = ""
        var dosageUnit: String = "mg"
        /// Original ingredientsText preserved verbatim when it can't be parsed as
        /// "<number> <unit>" — round-trips free-form labels without loss.
        var originalText: String?
    }

    private let dosageUnits = ["mg", "g", "\u{00B5}g", "IU", "ml", "drops"]
    private let timesOfDay = ["morning", "noon", "evening", "anytime"]
    private let weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    init(supplement: Supplement? = nil, onSaved: @escaping (Supplement) -> Void = { _ in }) {
        existingSupplement = supplement
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.name, text: $name)
                }

                Section(L10n.schedule) {
                    Picker(L10n.type, selection: $scheduleType) {
                        Text(L10n.daily).tag(ScheduleType.daily)
                        Text(L10n.everyOtherDay).tag(ScheduleType.everyOtherDay)
                        Text(L10n.weekly).tag(ScheduleType.weekly)
                        Text(L10n.custom).tag(ScheduleType.specificDays)
                    }

                    if scheduleType == .weekly || scheduleType == .specificDays {
                        HStack {
                            ForEach(0 ..< 7, id: \.self) { day in
                                Button {
                                    if scheduleDays.contains(day) {
                                        scheduleDays.remove(day)
                                    } else {
                                        scheduleDays.insert(day)
                                    }
                                } label: {
                                    Text(weekdays[day])
                                        .font(.caption2)
                                        .frame(maxWidth: .infinity, minHeight: 36)
                                        .background(scheduleDays.contains(day) ? Color.accentColor : Color.clear)
                                        .foregroundStyle(scheduleDays.contains(day) ? .white : .primary)
                                        .clipShape(RoundedRectangle(cornerRadius: 6))
                                        .contentShape(RoundedRectangle(cornerRadius: 6))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    Picker(L10n.timeOfDay, selection: $timeOfDay) {
                        Text(L10n.morning).tag("morning")
                        Text(L10n.noon).tag("noon")
                        Text(L10n.evening).tag("evening")
                        Text(L10n.anytime).tag("anytime")
                    }
                }

                remindersSection

                Section {
                    Toggle(L10n.active, isOn: $isActive)
                }

                Section(L10n.ingredients) {
                    ForEach($ingredientRows) { $row in
                        HStack {
                            TextField(L10n.name, text: $row.name)
                            TextField(L10n.dose, text: $row.dosage)
                                .keyboardType(.decimalPad)
                                .frame(width: 60)
                            TextField(L10n.unit, text: $row.dosageUnit)
                                .frame(width: 40)
                        }
                    }
                    .onDelete { indices in
                        ingredientRows.remove(atOffsets: indices)
                        if ingredientRows.isEmpty {
                            ingredientRows = [IngredientInputRow()]
                        }
                    }

                    Button {
                        ingredientRows.append(IngredientInputRow())
                    } label: {
                        Label(L10n.add, systemImage: "plus")
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .keyboardDismissable()
            .navigationTitle(existingSupplement != nil ? L10n.editSupplement : L10n.createSupplement)
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

    private var isValid: Bool {
        guard !name.isEmpty, !ingredientRows.isEmpty else { return false }
        return ingredientRows.allSatisfy { row in
            !row.name.isEmpty &&
                ((Double.parseUserInput(row.dosage) ?? 0) > 0 || (row.originalText ?? "").isEmpty == false)
        }
    }

    /// Parses "42 mg" out of an existing ingredientsText. Returns (dosage, unit,
    /// original) where `original` is non-nil when we couldn't fully parse the
    /// text so the caller keeps the raw string around for round-trip safety.
    private func parseDosage(_ text: String?) -> (Double?, String, String?) {
        guard let text = text?.trimmingCharacters(in: .whitespaces), !text.isEmpty else {
            return (nil, "mg", nil)
        }
        let pattern = #"^\s*([\d.]+)\s*(\S+)\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.numberOfRanges == 3,
              let doseRange = Range(match.range(at: 1), in: text),
              let unitRange = Range(match.range(at: 2), in: text),
              let dose = Double(text[doseRange])
        else {
            return (nil, "mg", text)
        }
        return (dose, String(text[unitRange]), nil)
    }

    private func prefill() {
        guard let s = existingSupplement else { return }
        name = s.name
        scheduleType = s.scheduleType
        scheduleDays = Set(s.scheduleDays ?? [])
        timeOfDay = s.timeOfDay ?? "anytime"
        reminderTimes = s.reminderTimes ?? []
        isActive = s.isActive
        let rows = s.ingredients.map { ing -> IngredientInputRow in
            let parsed = parseDosage(ing.food.ingredientsText)
            return IngredientInputRow(
                name: ing.food.name,
                dosage: parsed.0.map { "\($0)" } ?? "",
                dosageUnit: parsed.1,
                originalText: parsed.2
            )
        }
        ingredientRows = rows.isEmpty ? [IngredientInputRow()] : rows
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let ingredientInputs = ingredientRows.enumerated().map { idx, row -> SupplementIngredientInput in
            let dose = Double.parseUserInput(row.dosage) ?? 0
            let label: String = if dose > 0 {
                "\(row.dosage) \(row.dosageUnit)"
            } else {
                row.originalText ?? ""
            }
            return SupplementIngredientInput(
                foodId: nil,
                food: SupplementBackingFoodInput(
                    name: row.name,
                    servingSize: 1,
                    servingUnit: "g",
                    calories: 0,
                    protein: 0,
                    carbs: 0,
                    fat: 0,
                    fiber: 0,
                    ingredientsText: label
                ),
                servings: 1,
                sortOrder: idx
            )
        }

        do {
            let saved: Supplement
            if let existing = existingSupplement {
                let update = SupplementUpdate(
                    name: name,
                    scheduleType: scheduleType,
                    scheduleDays: scheduleDays.isEmpty ? nil : Array(scheduleDays).sorted(),
                    isActive: isActive,
                    timeOfDay: timeOfDay,
                    reminderTimes: reminderTimes.sorted(),
                    ingredients: ingredientInputs
                )
                saved = try await supplementRepository.updateSupplement(id: existing.id, update)
            } else {
                let create = SupplementCreate(
                    name: name,
                    scheduleType: scheduleType,
                    scheduleDays: scheduleDays.isEmpty ? nil : Array(scheduleDays).sorted(),
                    isActive: isActive,
                    timeOfDay: timeOfDay,
                    reminderTimes: reminderTimes.sorted(),
                    ingredients: ingredientInputs
                )
                saved = try await supplementRepository.createSupplement(create)
            }
            await SupplementReminderScheduler.refill(repository: supplementRepository)
            onSaved(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

private extension SupplementEditSheet {
    static let maxReminderTimes = 6

    /// The label is only a grouping header, but it's the best hint we have for what clock
    /// time the user actually means, so it seeds the first row.
    static func defaultReminderTime(for timeOfDay: String) -> String {
        switch timeOfDay {
        case "noon": "12:00"
        case "evening": "20:00"
        default: "08:00"
        }
    }

    /// Reminder times, plus the permission prompt.
    ///
    /// Permission is requested when the *first* time is added — the moment of intent.
    /// Times save either way: they are server-side data other devices act on, and only
    /// this phone's delivery is gated.
    var remindersSection: some View {
        Section {
            if reminderTimes.isEmpty {
                Text(L10n.noReminders)
                    .foregroundStyle(.secondary)
                    .font(.footnote)
            } else {
                ForEach(Array(reminderTimes.enumerated()), id: \.offset) { index, time in
                    DatePicker(
                        L10n.reminders,
                        selection: reminderBinding(at: index),
                        displayedComponents: .hourAndMinute
                    )
                    .labelsHidden()
                    .accessibilityLabel(time)
                }
                .onDelete { offsets in
                    reminderTimes.remove(atOffsets: offsets)
                }
            }

            Button(L10n.addReminderTime, systemImage: "plus") {
                addReminderTime()
            }
            .disabled(reminderTimes.count >= Self.maxReminderTimes)

            if !reminderTimes.isEmpty, !notificationsAuthorized {
                // A denied authorization can never be re-prompted, so the system settings
                // page is the only route left.
                Text(L10n.notificationsDisabled)
                    .font(.footnote)
                    .foregroundStyle(.red)
                Button(L10n.openSettings) {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
            }
        } header: {
            Text(L10n.reminders)
        }
        .task {
            notificationsAuthorized = await SupplementReminderScheduler.authorizationStatus() == .authorized
        }
    }

    func addReminderTime() {
        let isFirst = reminderTimes.isEmpty
        // Prefer the label's time, then the other presets, so a second row can't silently
        // collide with the first.
        let candidates = [Self.defaultReminderTime(for: timeOfDay), "08:00", "12:00", "20:00"]
        let next = candidates.first { !reminderTimes.contains($0) } ?? "08:00"
        reminderTimes = (reminderTimes + [next]).sorted()
        if isFirst {
            Task {
                notificationsAuthorized = await SupplementReminderScheduler.requestAuthorizationIfNeeded()
            }
        }
    }

    /// Bridges the stored "HH:MM" string to the DatePicker's Date. Rewrites the whole list
    /// distinct + sorted on every change: duplicates would arm two notifications on the
    /// same identifier, and the server stores them sorted anyway.
    func reminderBinding(at index: Int) -> Binding<Date> {
        Binding(
            get: {
                let parsed = SupplementSchedule.parseTime(reminderTimes[index]) ?? (hour: 8, minute: 0)
                return Calendar.current.date(
                    bySettingHour: parsed.hour, minute: parsed.minute, second: 0, of: Date()
                ) ?? Date()
            },
            set: { newValue in
                let components = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                let formatted = String(format: "%02d:%02d", components.hour ?? 8, components.minute ?? 0)
                var updated = reminderTimes
                updated[index] = formatted
                reminderTimes = Array(Set(updated)).sorted()
            }
        )
    }
}
