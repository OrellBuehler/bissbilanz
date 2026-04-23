import SwiftUI

struct SupplementEditSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let existingSupplement: Supplement?
    let onSaved: (Supplement) -> Void

    @State private var name = ""
    @State private var scheduleType: ScheduleType = .daily
    @State private var scheduleDays: Set<Int> = []
    @State private var timeOfDay = "anytime"
    @State private var isActive = true
    @State private var ingredientRows: [IngredientInputRow] = [IngredientInputRow()]
    @State private var isSaving = false
    @State private var errorMessage: String?

    struct IngredientInputRow: Identifiable {
        let id = UUID()
        var name: String = ""
        var dosage: String = ""
        var dosageUnit: String = "mg"
        // Original ingredientsText preserved verbatim when it can't be parsed as
        // "<number> <unit>" — round-trips free-form labels without loss.
        var originalText: String? = nil
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
                ((Double(row.dosage) ?? 0) > 0 || (row.originalText ?? "").isEmpty == false)
        }
    }

    // Parses "42 mg" out of an existing ingredientsText. Returns (dosage, unit,
    // original) where `original` is non-nil when we couldn't fully parse the
    // text so the caller keeps the raw string around for round-trip safety.
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
            let dose = Double(row.dosage) ?? 0
            let label: String
            if dose > 0 {
                label = "\(row.dosage) \(row.dosageUnit)"
            } else {
                label = row.originalText ?? ""
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
                    ingredients: ingredientInputs
                )
                saved = try await api.updateSupplement(id: existing.id, update)
            } else {
                let create = SupplementCreate(
                    name: name,
                    scheduleType: scheduleType,
                    scheduleDays: scheduleDays.isEmpty ? nil : Array(scheduleDays).sorted(),
                    isActive: isActive,
                    timeOfDay: timeOfDay,
                    ingredients: ingredientInputs
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
