import SwiftUI

struct QuickEntrySheet: View {
    @Environment(EntryRepository.self) private var entryRepository
    @Environment(\.dismiss) private var dismiss

    let date: String
    let onSaved: () -> Void

    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var fiber = ""
    @State private var mealType = "snacks"
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let mealTypes = ["breakfast", "lunch", "dinner", "snacks"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                }

                Section(L10n.nutrition) {
                    macroField(L10n.calories, text: $calories, unit: "kcal")
                    macroField(L10n.protein, text: $protein, unit: "g")
                    macroField(L10n.carbs, text: $carbs, unit: "g")
                    macroField(L10n.fat, text: $fat, unit: "g")
                    macroField(L10n.fiber, text: $fiber, unit: "g")
                }
            }
            .navigationTitle(L10n.quickEntry)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.log) {
                        Task { await save() }
                    }
                    .disabled(name.isEmpty || isSaving)
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
    }

    private func macroField(_ label: String, text: Binding<String>, unit: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text(unit)
                .foregroundStyle(.secondary)
                .frame(width: 30, alignment: .leading)
        }
    }

    private func save() async {
        isSaving = true
        let entry = EntryCreate(
            mealType: mealType,
            servings: 1,
            date: date,
            quickName: name,
            quickCalories: Double.parseUserInput(calories),
            quickProtein: Double.parseUserInput(protein),
            quickCarbs: Double.parseUserInput(carbs),
            quickFat: Double.parseUserInput(fat),
            quickFiber: Double.parseUserInput(fiber)
        )
        do {
            try await entryRepository.createEntry(entry)
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
