import SwiftUI

struct SettingsGoalsSection: View {
    @Environment(PreferencesRepository.self) private var preferencesRepository
    let goals: Goals
    @Binding var preferences: Preferences
    @Binding var isEditingGoals: Bool

    @State private var waterGoalDraft = "2000"
    @FocusState private var waterGoalFocused: Bool

    var body: some View {
        Section {
            SettingsGoalRow(label: L10n.calories, value: goals.calorieGoal, unit: "kcal", color: MacroColors.calories)
            SettingsGoalRow(label: L10n.protein, value: goals.proteinGoal, unit: "g", color: MacroColors.protein)
            SettingsGoalRow(label: L10n.carbs, value: goals.carbGoal, unit: "g", color: MacroColors.carbs)
            SettingsGoalRow(label: L10n.fat, value: goals.fatGoal, unit: "g", color: MacroColors.fat)
            SettingsGoalRow(label: L10n.fiber, value: goals.fiberGoal, unit: "g", color: MacroColors.fiber)
            waterGoalRow
            Button(L10n.editGoals) {
                isEditingGoals = true
            }
        } header: {
            Text(L10n.goals)
        } footer: {
            Text(L10n.settingsWaterGoalDesc)
        }
    }

    /// Daily water goal — surfaced on the day card's water tracker. The number
    /// pad has no return key, so the keyboard toolbar's Done (which resigns
    /// focus) is what commits it.
    private var waterGoalRow: some View {
        HStack {
            Text(L10n.settingsWaterGoalLabel)
            Spacer()
            TextField("", text: $waterGoalDraft)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
                .focused($waterGoalFocused)
                .onSubmit { Task { await saveWaterGoal() } }
            Text(L10n.dayUnitMl)
                .foregroundStyle(.secondary)
        }
        .onChange(of: preferences.waterGoalMl, initial: true) { _, waterGoalMl in
            waterGoalDraft = String(waterGoalMl ?? 2000)
        }
        .onChange(of: waterGoalFocused) { _, focused in
            if !focused { Task { await saveWaterGoal() } }
        }
    }

    private func saveWaterGoal() async {
        guard let parsed = Int(waterGoalDraft.trimmingCharacters(in: .whitespaces)) else {
            waterGoalDraft = String(preferences.waterGoalMl ?? 2000)
            return
        }
        let clamped = min(max(parsed, 250), 10000)
        waterGoalDraft = String(clamped)
        guard clamped != (preferences.waterGoalMl ?? 2000) else { return }
        var update = PreferencesUpdate()
        update.waterGoalMl = clamped
        preferences = await (try? preferencesRepository.update(update))
            ?? (preferencesRepository.preferences() ?? .defaults)
    }
}

struct SettingsGoalRow: View {
    let label: String
    let value: Double
    let unit: String
    let color: Color

    var body: some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(label)
            Spacer()
            Text("\(Int(value)) \(unit)")
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

struct SettingsGoalsEditor: View {
    @Environment(GoalsRepository.self) private var goalsRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Environment(\.dismiss) private var dismiss
    @Binding var goals: Goals
    @Binding var preferences: Preferences
    @Binding var errorMessage: String?

    @State private var editCalories: String
    @State private var editProtein: String
    @State private var editCarbs: String
    @State private var editFat: String
    @State private var editFiber: String
    @State private var editTargetWeight: String
    @State private var hasTargetDate: Bool
    @State private var editTargetDate: Date
    @State private var editActivityGoalAdjustment: Bool
    @State private var editActivityCreditPercent: Int

    init(goals: Binding<Goals>, preferences: Binding<Preferences>, errorMessage: Binding<String?>) {
        _goals = goals
        _preferences = preferences
        _errorMessage = errorMessage
        let current = goals.wrappedValue
        let currentPreferences = preferences.wrappedValue
        _editCalories = State(initialValue: "\(Int(current.calorieGoal))")
        _editProtein = State(initialValue: "\(Int(current.proteinGoal))")
        _editCarbs = State(initialValue: "\(Int(current.carbGoal))")
        _editFat = State(initialValue: "\(Int(current.fatGoal))")
        _editFiber = State(initialValue: "\(Int(current.fiberGoal))")
        _editTargetWeight = State(initialValue: current.targetWeightKg.map { String(format: "%.1f", $0) } ?? "")
        _hasTargetDate = State(initialValue: current.targetDate != nil)
        _editTargetDate = State(initialValue: current.targetDate.flatMap(DateFormatting.date(from:)) ?? Date())
        _editActivityGoalAdjustment = State(initialValue: currentPreferences.activityGoalAdjustment)
        _editActivityCreditPercent = State(initialValue: currentPreferences.activityCreditPercent)
    }

    var body: some View {
        NavigationStack {
            Form {
                dailyGoalsSection
                weightTargetSection
                activitySection
            }
            .keyboardDismissable()
            .navigationTitle(L10n.editGoals)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await saveGoals() }
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private var dailyGoalsSection: some View {
        Section {
            SettingsGoalField(label: L10n.calories + " (kcal)", text: $editCalories)
            SettingsGoalField(
                label: L10n.protein + " (g)",
                text: $editProtein,
                share: macroShare(editProtein, kcalPerGram: 4)
            )
            SettingsGoalField(
                label: L10n.carbs + " (g)",
                text: $editCarbs,
                share: macroShare(editCarbs, kcalPerGram: 4)
            )
            SettingsGoalField(
                label: L10n.fat + " (g)",
                text: $editFat,
                share: macroShare(editFat, kcalPerGram: 9)
            )
            SettingsGoalField(label: L10n.fiber + " (g)", text: $editFiber)
        } header: {
            Text(L10n.dailyGoals)
        } footer: {
            macroBalanceFooter
        }
    }

    private var weightTargetSection: some View {
        Section(L10n.weightTarget) {
            SettingsGoalField(label: L10n.goalsTargetWeightLabel, text: $editTargetWeight)
            Toggle(L10n.goalsTargetDateLabel, isOn: $hasTargetDate)
            if hasTargetDate {
                DatePicker("", selection: $editTargetDate, displayedComponents: .date)
                    .labelsHidden()
                    .accessibilityLabel(L10n.goalsTargetDateLabel)
            }
            if goals.targetWeightKg != nil || goals.targetDate != nil {
                Button(L10n.goalsTargetClear, role: .destructive) {
                    editTargetWeight = ""
                    hasTargetDate = false
                }
            }
        }
    }

    private var activitySection: some View {
        Section {
            Toggle(L10n.goalsActivityAdjustmentToggle, isOn: $editActivityGoalAdjustment)
            if editActivityGoalAdjustment {
                Stepper(
                    L10n.goalsActivityCreditPercent(editActivityCreditPercent),
                    value: $editActivityCreditPercent,
                    in: 0 ... 100,
                    step: 5
                )
            }
        } footer: {
            Text(L10n.goalsActivityAdjustmentFooter)
        }
    }

    /// Calories a macro's grams contribute, as a share of the calorie goal.
    private func macroShare(_ grams: String, kcalPerGram: Double) -> Int? {
        guard let grams = Double.parseUserInput(grams),
              let calories = Double.parseUserInput(editCalories), calories > 0
        else { return nil }
        return Int((grams * kcalPerGram / calories * 100).rounded())
    }

    /// Calories implied by the protein, carb and fat goals. Fiber is left out:
    /// it is counted within carbs, and its own energy value depends on how
    /// much of it is soluble.
    private var macroCalories: Double? {
        guard let protein = Double.parseUserInput(editProtein),
              let carbs = Double.parseUserInput(editCarbs),
              let fat = Double.parseUserInput(editFat)
        else { return nil }
        return protein * 4 + carbs * 4 + fat * 9
    }

    /// A hint, never a gate: goals that don't add up still save, the user
    /// just gets to see by how much they are off.
    @ViewBuilder
    private var macroBalanceFooter: some View {
        if let macroCalories, let calories = Double.parseUserInput(editCalories), calories > 0 {
            let sum = Int(macroCalories.rounded())
            let goal = Int(calories.rounded())
            let diff = sum - goal
            VStack(alignment: .leading, spacing: 4) {
                // Whole grams move the sum in steps of 4 and 9 kcal, so a few
                // kcal either way is as close as the fields allow.
                if abs(diff) < 10 {
                    Text(L10n.goalsMacroSum(sum))
                } else {
                    let detail = diff < 0
                        ? L10n.goalsMacroShort(-diff, goal: goal)
                        : L10n.goalsMacroOver(diff, goal: goal)
                    Label {
                        Text(L10n.goalsMacroSum(sum) + " " + detail)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                    }
                    .foregroundStyle(.orange)
                }
                Text(L10n.goalsMacroFactors)
            }
        }
    }

    private func saveGoals() async {
        let newGoals = Goals(
            calorieGoal: Double.parseUserInput(editCalories) ?? goals.calorieGoal,
            proteinGoal: Double.parseUserInput(editProtein) ?? goals.proteinGoal,
            carbGoal: Double.parseUserInput(editCarbs) ?? goals.carbGoal,
            fatGoal: Double.parseUserInput(editFat) ?? goals.fatGoal,
            fiberGoal: Double.parseUserInput(editFiber) ?? goals.fiberGoal,
            sodiumGoal: goals.sodiumGoal,
            sugarGoal: goals.sugarGoal,
            targetWeightKg: Double.parseUserInput(editTargetWeight),
            targetDate: hasTargetDate ? editTargetDate.isoDateString : nil
        )
        do {
            goals = try await goalsRepository.setGoals(newGoals)
        } catch {
            errorMessage = error.localizedDescription
            // The optimistic local write persisted — keep the view in sync with it.
            goals = goalsRepository.goals() ?? .defaults
        }

        var prefsUpdate = PreferencesUpdate()
        prefsUpdate.activityGoalAdjustment = editActivityGoalAdjustment
        prefsUpdate.activityCreditPercent = editActivityCreditPercent
        preferences = await (try? preferencesRepository.update(prefsUpdate))
            ?? (preferencesRepository.preferences() ?? .defaults)

        dismiss()
    }
}

struct SettingsGoalField: View {
    let label: String
    @Binding var text: String
    var share: Int?

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            if let share {
                Text("\(share)%")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            TextField("", text: $text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
        }
    }
}
