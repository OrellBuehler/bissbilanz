import SwiftUI

/// Compact day-properties card: a water tracker with quick-add buttons, an
/// informational activity-calories input with a short note, and an
/// autosaving notes field. Mirrors the web `DayPropertiesCard.svelte`.
/// Offline-first through `EntryRepository.setDayProperties`, which merges
/// each partial write onto the day's stored row rather than replacing it.
struct DayPropertiesCard: View {
    private enum Field: Hashable {
        case water, activity, activityNote, notes
    }

    private static let maxWaterMl = 20000
    private static let maxActivityCalories = 20000
    private static let notesDebounce: UInt64 = 1_200_000_000

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository

    let date: String
    /// Reported after every load/save so the dashboard can show an
    /// "Activity: +N kcal" summary line without this card owning that layout.
    var onActivityChange: ((Int?) -> Void)?

    @State private var properties: DayProperties?
    @State private var waterGoalMl = 2000
    @State private var waterDraft = ""
    @State private var activityDraft = ""
    @State private var activityNoteDraft = ""
    @State private var notesDraft = ""
    @State private var notesDirty = false
    @State private var notesTask: Task<Void, Never>?
    @FocusState private var focusedField: Field?

    private var waterMl: Int { properties?.waterMl ?? 0 }
    private var waterProgress: Double {
        guard waterGoalMl > 0 else { return 0 }
        return min(Double(waterMl) / Double(waterGoalMl), 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 6) {
                Image(systemName: "calendar")
                    .foregroundStyle(.secondary)
                Text(L10n.dayCardTitle)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Spacer()
            }

            waterSection
            Divider()
            activitySection
            Divider()
            notesSection
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .task(id: date) { load() }
        .onChange(of: focusedField) { previous, _ in
            switch previous {
            case .water: commitWater()
            case .activity: commitActivity()
            case .activityNote: commitActivityNote()
            case .notes: commitNotes()
            case nil: break
            }
        }
    }

    private var adaptiveInputLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 8))
    }

    // MARK: - Water

    private var waterSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "drop.fill")
                        .foregroundStyle(MacroColors.water)
                    Text(L10n.dayWaterTitle)
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
                Spacer()
                Text(L10n.dayWaterProgress(current: waterMl, goal: waterGoalMl))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: waterProgress)
                .tint(MacroColors.water)

            adaptiveInputLayout {
                Button(L10n.dayWaterAdd(250)) { addWater(250) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                Button(L10n.dayWaterAdd(500)) { addWater(500) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                TextField(L10n.dayWaterInputLabel, text: $waterDraft)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(minWidth: 68)
                    .focused($focusedField, equals: .water)
                    .onSubmit(commitWater)
                Text(L10n.dayUnitMl)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if waterMl > 0 {
                    Button(action: clearWater) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.dayWaterClear)
                }
            }
        }
    }

    private func addWater(_ delta: Int) {
        let clamped = clamp(waterMl + delta, max: Self.maxWaterMl)
        waterDraft = String(clamped)
        save(DayPropertiesPatch(waterMl: .some(clamped)))
    }

    private func commitWater() {
        let parsed = parseInt(waterDraft)
        let clamped = parsed.map { clamp($0, max: Self.maxWaterMl) }
        waterDraft = clamped.map(String.init) ?? ""
        save(DayPropertiesPatch(waterMl: .some(clamped)))
    }

    private func clearWater() {
        waterDraft = ""
        save(DayPropertiesPatch(waterMl: .some(nil)))
    }

    // MARK: - Activity

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "flame.fill")
                    .foregroundStyle(MacroColors.activity)
                Text(L10n.dayActivityTitle)
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            adaptiveInputLayout {
                TextField("0", text: $activityDraft)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(minWidth: 68)
                    .focused($focusedField, equals: .activity)
                    .onSubmit(commitActivity)
                Text(L10n.insightsKcalUnit)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField(L10n.dayActivityNotePlaceholder, text: $activityNoteDraft)
                    .textFieldStyle(.roundedBorder)
                    .focused($focusedField, equals: .activityNote)
                    .onSubmit(commitActivityNote)
                if properties?.activityCalories != nil || !(properties?.activityNote ?? "").isEmpty {
                    Button(action: clearActivity) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.dayActivityClear)
                }
            }
            Text(L10n.dayActivityInformational)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func commitActivity() {
        let parsed = parseInt(activityDraft)
        let clamped = parsed.map { clamp($0, max: Self.maxActivityCalories) }
        activityDraft = clamped.map(String.init) ?? ""
        save(DayPropertiesPatch(activityCalories: .some(clamped)))
    }

    private func commitActivityNote() {
        let trimmed = activityNoteDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = trimmed.isEmpty ? nil : String(trimmed.prefix(200))
        activityNoteDraft = value ?? ""
        save(DayPropertiesPatch(activityNote: .some(value)))
    }

    private func clearActivity() {
        activityDraft = ""
        activityNoteDraft = ""
        save(DayPropertiesPatch(activityCalories: .some(nil), activityNote: .some(nil)))
    }

    // MARK: - Notes

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "note.text")
                    .foregroundStyle(.secondary)
                Text(L10n.dayNotesTitle)
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            ZStack(alignment: .topLeading) {
                if notesDraft.isEmpty {
                    Text(L10n.dayNotesPlaceholder)
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                }
                TextEditor(text: $notesDraft)
                    .frame(minHeight: 60, maxHeight: 100)
                    .focused($focusedField, equals: .notes)
                    .onChange(of: notesDraft) { _, _ in onNotesChanged() }
            }
        }
    }

    private func onNotesChanged() {
        notesDirty = true
        notesTask?.cancel()
        notesTask = Task {
            try? await Task.sleep(nanoseconds: Self.notesDebounce)
            guard !Task.isCancelled else { return }
            commitNotes()
        }
    }

    private func commitNotes() {
        notesTask?.cancel()
        notesTask = nil
        let trimmed = notesDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        notesDirty = false
        guard trimmed != (properties?.notes ?? "") else { return }
        let value = trimmed.isEmpty ? nil : String(trimmed.prefix(2000))
        save(DayPropertiesPatch(notes: .some(value)))
    }

    // MARK: - Load/Save

    private func load() {
        properties = entryRepository.dayProperties(date: date)
        waterGoalMl = preferencesRepository.preferences()?.waterGoalMl ?? 2000
        waterDraft = properties?.waterMl.map(String.init) ?? ""
        activityDraft = properties?.activityCalories.map(String.init) ?? ""
        activityNoteDraft = properties?.activityNote ?? ""
        if !notesDirty { notesDraft = properties?.notes ?? "" }
        onActivityChange?(properties?.activityCalories)
    }

    private func save(_ patch: DayPropertiesPatch) {
        Task {
            try? await entryRepository.setDayProperties(date: date, patch: patch)
            properties = entryRepository.dayProperties(date: date)
            onActivityChange?(properties?.activityCalories)
        }
    }

    private func parseInt(_ text: String) -> Int? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : Int(trimmed)
    }

    private func clamp(_ value: Int, max upper: Int) -> Int {
        Swift.max(0, Swift.min(value, upper))
    }
}
