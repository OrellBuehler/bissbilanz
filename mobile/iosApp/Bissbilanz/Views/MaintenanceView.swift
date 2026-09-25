import SwiftUI

struct MaintenanceView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private func accessibleColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    @State private var selectedWeeks = 4
    @State private var bodyFatRatio = 0.5
    @State private var result: MaintenanceResponse?
    @State private var isCalculating = false
    @State private var error: String?
    @ScaledMetric(relativeTo: .largeTitle) private var heroNumberSize = 48.0

    private let weekOptions = [2, 4, 8, 12]

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                periodSelector
                compositionSlider
                calculateButton

                if let result {
                    resultCard(result)
                    coverageCard(result)
                }

                if let error {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .padding()
                }
            }
            .padding()
        }
        .navigationTitle(L10n.maintenance)
    }

    private var periodSelector: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.period)
                    .font(.headline)

                Picker(L10n.period, selection: $selectedWeeks) {
                    ForEach(weekOptions, id: \.self) { w in
                        Text("\(w) \(L10n.weeks)").tag(w)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var compositionSlider: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.bodyComposition)
                    .font(.headline)

                HStack {
                    Text(L10n.fatLabel)
                        .font(.caption)
                        .foregroundStyle(accessibleColor(.fat))
                        .accessibilityHidden(true)
                    Slider(value: $bodyFatRatio, in: 0 ... 1, step: 0.05)
                        .accessibilityLabel(L10n.bodyComposition)
                        .accessibilityValue(compositionAccessibilityValue)
                    Text(L10n.muscleLabel)
                        .font(.caption)
                        .foregroundStyle(accessibleColor(.protein))
                        .accessibilityHidden(true)
                }

                HStack {
                    Text("\(MacroFormat.percent(bodyFatRatio * 100)) fat")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(MacroFormat.percent((1 - bodyFatRatio) * 100)) muscle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityHidden(true)
            }
        }
    }

    private var compositionAccessibilityValue: String {
        "\(MacroFormat.percent(bodyFatRatio * 100)) \(L10n.fatLabel), " +
            "\(MacroFormat.percent((1 - bodyFatRatio) * 100)) \(L10n.muscleLabel)"
    }

    private var calculateButton: some View {
        Button {
            calculate()
        } label: {
            if isCalculating {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else {
                Text(L10n.calculate)
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isCalculating)
    }

    private func resultCard(_ result: MaintenanceResponse) -> some View {
        CardView {
            VStack(spacing: 16) {
                Text(L10n.maintenanceCalories)
                    .font(.headline)

                Text(MacroFormat.kcal(result.maintenanceCalories))
                    .font(.system(size: heroNumberSize, weight: .bold))
                    .foregroundStyle(accessibleColor(.calories))
                    .accessibilityLabel(L10n.maintenanceCalories)
                    .accessibilityValue("\(MacroFormat.kcal(result.maintenanceCalories)) \(L10n.kcalPerDay)")

                Text(L10n.kcalPerDay)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)

                Divider()

                VStack(spacing: 8) {
                    resultRow(L10n.avgDailyIntake, value: "\(MacroFormat.kcal(result.avgDailyCalories)) kcal")
                    resultRow(L10n.dailyDeficitSurplus, value: "\(MacroFormat.kcal(result.dailyDeficitSurplus)) kcal")
                    resultRow(L10n.weightChange, value: MacroFormat.kg(result.weightChange))
                    if let fatChange = result.fatChange {
                        resultRow(L10n.fatChange, value: MacroFormat.kg(fatChange))
                    }
                    if let muscleChange = result.muscleChange {
                        resultRow(L10n.muscleChange, value: MacroFormat.kg(muscleChange))
                    }
                }
            }
        }
    }

    private func coverageCard(_ result: MaintenanceResponse) -> some View {
        CardView {
            VStack(alignment: .leading, spacing: 8) {
                Text(L10n.dataCoverage)
                    .font(.headline)

                resultRow(L10n.totalDays, value: "\(result.totalDays)")
                resultRow(L10n.weightEntries, value: "\(result.weightEntryCount)")
                resultRow(L10n.foodEntryDays, value: "\(result.foodEntryDays)")
                resultRow(L10n.coverage, value: MacroFormat.percent(result.coveragePercent))
                resultRow(L10n.startWeight, value: MacroFormat.kg(result.startWeight))
                resultRow(L10n.endWeight, value: MacroFormat.kg(result.endWeight))

                if result.coveragePercent < 70 {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .accessibilityHidden(true)
                        Text(L10n.lowCoverageWarning)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private func resultRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
        .font(.subheadline)
        .accessibilityElement(children: .combine)
    }

    private func calculate() {
        isCalculating = true
        error = nil

        let endDate = Date()
        let days = selectedWeeks * 7
        let startDate = endDate.adding(days: -days)

        let response = LocalMaintenance.compute(
            context: modelContext,
            startDate: startDate.isoDateString,
            endDate: endDate.isoDateString,
            days: days,
            bodyFatRatio: bodyFatRatio
        )
        if response == nil {
            error = L10n.maintenanceInsufficientData
        }
        result = response
        isCalculating = false
    }
}
