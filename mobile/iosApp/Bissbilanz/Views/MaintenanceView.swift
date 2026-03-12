import SwiftUI

struct MaintenanceView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var selectedWeeks = 4
    @State private var bodyFatRatio = 0.5
    @State private var result: MaintenanceResponse?
    @State private var isCalculating = false
    @State private var error: String?

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
                    Text("Fat")
                        .font(.caption)
                        .foregroundStyle(MacroColors.fat)
                    Slider(value: $bodyFatRatio, in: 0...1, step: 0.05)
                    Text("Muscle")
                        .font(.caption)
                        .foregroundStyle(MacroColors.protein)
                }

                HStack {
                    Text("\(Int(bodyFatRatio * 100))% fat")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(Int((1 - bodyFatRatio) * 100))% muscle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var calculateButton: some View {
        Button {
            Task { await calculate() }
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

                Text("\(Int(result.maintenanceCalories))")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(MacroColors.calories)

                Text("kcal/day")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Divider()

                VStack(spacing: 8) {
                    resultRow("Avg Daily Intake", value: "\(Int(result.avgDailyCalories)) kcal")
                    resultRow("Daily Surplus/Deficit", value: "\(Int(result.dailyDeficitSurplus)) kcal")
                    resultRow("Weight Change", value: String(format: "%.1f kg", result.weightChange))
                    if let fatChange = result.fatChange {
                        resultRow("Fat Change", value: String(format: "%.1f kg", fatChange))
                    }
                    if let muscleChange = result.muscleChange {
                        resultRow("Muscle Change", value: String(format: "%.1f kg", muscleChange))
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

                resultRow("Total Days", value: "\(result.totalDays)")
                resultRow("Weight Entries", value: "\(result.weightEntryCount)")
                resultRow("Food Entry Days", value: "\(result.foodEntryDays)")
                resultRow("Coverage", value: "\(Int(result.coveragePercent))%")
                resultRow("Start Weight", value: String(format: "%.1f kg", result.startWeight))
                resultRow("End Weight", value: String(format: "%.1f kg", result.endWeight))

                if result.coveragePercent < 70 {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                        Text("Low data coverage may affect accuracy")
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
    }

    private func calculate() async {
        isCalculating = true
        error = nil

        let endDate = Date()
        let startDate = endDate.adding(days: -selectedWeeks * 7)

        let request = MaintenanceRequest(
            startDate: startDate.isoDateString,
            endDate: endDate.isoDateString,
            bodyFatChangeRatio: bodyFatRatio
        )

        do {
            result = try await api.calculateMaintenance(request)
        } catch {
            self.error = error.localizedDescription
        }
        isCalculating = false
    }
}
