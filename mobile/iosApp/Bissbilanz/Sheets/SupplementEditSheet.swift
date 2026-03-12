import SwiftUI

struct SupplementEditSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let existingSupplement: Supplement?
    let onSaved: (Supplement) -> Void

    @State private var name = ""
    @State private var dosage = ""
    @State private var dosageUnit = "mg"
    @State private var scheduleType: ScheduleType = .daily
    @State private var scheduleDays: Set<Int> = []
    @State private var timeOfDay = "anytime"
    @State private var isActive = true
    @State private var ingredientRows: [IngredientInputRow] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    struct IngredientInputRow: Identifiable {
        let id = UUID()
        var name: String
        var dosage: String
        var dosageUnit: String
    }

    private let dosageUnits = ["mg", "g", "\u{00B5}g", "IU", "ml", "drops"]
    private let timesOfDay = ["morning", "noon", "evening", "anytime"]
    private let weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    init(supplement: Supplement? = nil, onSaved: @escaping (Supplement) -> Void = { _ in }) {
        self.existingSupplement = supplement
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    HStack {
                        TextField("Dosage", text: $dosage)
                            .keyboardType(.decimalPad)
                            .frame(width: 80)
                        Picker("Unit", selection: $dosageUnit) {
                            ForEach(dosageUnits, id: \.self) { Text($0) }
                        }
                    }
                }

                Section("Schedule") {
                    Picker("Type", selection: $scheduleType) {
                        Text(L10n.daily).tag(ScheduleType.daily)
                        Text(L10n.everyOtherDay).tag(ScheduleType.everyOtherDay)
                        Text(L10n.weekly).tag(ScheduleType.weekly)
                        Text(L10n.custom).tag(ScheduleType.specificDays)
                    }

                    if scheduleType == .weekly || scheduleType == .specificDays {
                        HStack {
                            ForEach(0..<7, id: \.self) { day in
                                Button {
                                    if scheduleDays.contains(day) {
                                        scheduleDays.remove(day)
                                    } else {
                                        scheduleDays.insert(day)
                                    }
                                } label: {
                                    Text(weekdays[day])
                                        .font(.caption2)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 6)
                                        .background(scheduleDays.contains(day) ? Color.accentColor : Color.clear)
                                        .foregroundStyle(scheduleDays.contains(day) ? .white : .primary)
                                        .clipShape(RoundedRectangle(cornerRadius: 6))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    Picker("Time of Day", selection: $timeOfDay) {
                        Text(L10n.morning).tag("morning")
                        Text(L10n.noon).tag("noon")
                        Text(L10n.evening).tag("evening")
                        Text(L10n.anytime).tag("anytime")
                    }
                }

                Section {
                    Toggle("Active", isOn: $isActive)
                }

                Section(L10n.ingredients) {
                    ForEach($ingredientRows) { $row in
                        HStack {
                            TextField("Name", text: $row.name)
                            TextField("Dose", text: $row.dosage)
                                .keyboardType(.decimalPad)
                                .frame(width: 60)
                            TextField("Unit", text: $row.dosageUnit)
                                .frame(width: 40)
                        }
                    }
                    .onDelete { indices in
                        ingredientRows.remove(atOffsets: indices)
                    }

                    Button {
                        ingredientRows.append(IngredientInputRow(name: "", dosage: "", dosageUnit: "mg"))
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
                    .disabled(name.isEmpty || dosage.isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        guard let s = existingSupplement else { return }
        name = s.name
        dosage = "\(s.dosage)"
        dosageUnit = s.dosageUnit
        scheduleType = s.scheduleType
        scheduleDays = Set(s.scheduleDays ?? [])
        timeOfDay = s.timeOfDay ?? "anytime"
        isActive = s.isActive
        if let ings = s.ingredients {
            ingredientRows = ings.map { IngredientInputRow(name: $0.name, dosage: "\($0.dosage)", dosageUnit: $0.dosageUnit) }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let ingredientInputs = ingredientRows
            .filter { !$0.name.isEmpty }
            .map { SupplementIngredientInput(name: $0.name, dosage: Double($0.dosage) ?? 0, dosageUnit: $0.dosageUnit) }

        do {
            let saved: Supplement
            if let existing = existingSupplement {
                let update = SupplementUpdate(
                    name: name,
                    dosage: Double(dosage),
                    dosageUnit: dosageUnit,
                    scheduleType: scheduleType,
                    scheduleDays: scheduleDays.isEmpty ? nil : Array(scheduleDays).sorted(),
                    isActive: isActive,
                    timeOfDay: timeOfDay,
                    ingredients: ingredientInputs.isEmpty ? nil : ingredientInputs
                )
                saved = try await api.updateSupplement(id: existing.id, update)
            } else {
                let create = SupplementCreate(
                    name: name,
                    dosage: Double(dosage) ?? 0,
                    dosageUnit: dosageUnit,
                    scheduleType: scheduleType,
                    scheduleDays: scheduleDays.isEmpty ? nil : Array(scheduleDays).sorted(),
                    isActive: isActive,
                    timeOfDay: timeOfDay,
                    ingredients: ingredientInputs.isEmpty ? nil : ingredientInputs
                )
                saved = try await api.createSupplement(create)
            }
            onSaved(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
