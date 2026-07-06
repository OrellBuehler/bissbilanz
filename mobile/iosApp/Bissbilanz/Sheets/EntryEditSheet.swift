import SwiftUI

struct EntryEditSheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    let entry: Entry
    let onSaved: (Entry) -> Void

    @State private var servings: Double
    @State private var mealType: String
    @State private var eatenTime: Date
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    init(entry: Entry, onSaved: @escaping (Entry) -> Void) {
        self.entry = entry
        self.onSaved = onSaved
        _servings = State(initialValue: entry.servings)
        _mealType = State(initialValue: entry.mealType)
        _eatenTime = State(initialValue: entry.loggedAt ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(entry.displayName)
                        .font(.headline)
                }

                Section {
                    Stepper(value: $servings, in: 0.25 ... 50, step: 0.25) {
                        HStack {
                            Text(L10n.servings)
                            Spacer()
                            Text("\(servings, specifier: "%.2g")x")
                                .fontWeight(.medium)
                        }
                    }
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.menu)
                    DatePicker(L10n.time, selection: $eatenTime, displayedComponents: .hourAndMinute)
                }
            }
            .navigationTitle(L10n.editEntry)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(isSaving)
                    .fontWeight(.semibold)
                }
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
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        isSaving = true
        let update = EntryUpdate(mealType: mealType, servings: servings, eatenAt: eatenAtString())
        do {
            let updated = try await entryRepository.updateEntry(id: entry.id, update)
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    /// The picked time-of-day on the entry's day, as the UTC ISO-8601 `eatenAt`
    /// wire value — mirrors `LogFoodSheet.eatenAtString()`. `nil` (eaten time
    /// left unchanged) only if the components can't be combined.
    private func eatenAtString() -> String? {
        let day = entry.date.flatMap { DateFormatting.date(from: $0) } ?? entry.loggedAt ?? Date()
        let time = Calendar.current.dateComponents([.hour, .minute], from: eatenTime)
        guard let combined = Calendar.current.date(
            bySettingHour: time.hour ?? 0,
            minute: time.minute ?? 0,
            second: 0,
            of: day
        ) else { return nil }
        return DateFormatting.isoDateTimeString(from: combined)
    }
}
