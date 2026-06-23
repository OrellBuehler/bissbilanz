import SwiftUI

struct EntryEditSheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    let entry: Entry
    let onSaved: (Entry) -> Void

    @State private var servings: Double
    @State private var mealType: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let mealTypes = ["breakfast", "lunch", "dinner", "snacks"]

    init(entry: Entry, onSaved: @escaping (Entry) -> Void) {
        self.entry = entry
        self.onSaved = onSaved
        _servings = State(initialValue: entry.servings)
        _mealType = State(initialValue: entry.mealType)
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
        let update = EntryUpdate(mealType: mealType, servings: servings)
        do {
            let updated = try await entryRepository.updateEntry(id: entry.id, update)
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
