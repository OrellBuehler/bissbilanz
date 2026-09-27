import SwiftUI

enum MacroKind: String, CaseIterable, Identifiable {
    case protein, carbs, fat, fiber

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .protein: L10n.protein
        case .carbs: L10n.carbs
        case .fat: L10n.fat
        case .fiber: L10n.fiber
        }
    }

    var color: Color {
        switch self {
        case .protein: MacroColors.protein
        case .carbs: MacroColors.carbs
        case .fat: MacroColors.fat
        case .fiber: MacroColors.fiber
        }
    }

    var accessibleMacro: AccessibleMacroColor.Macro {
        switch self {
        case .protein: .protein
        case .carbs: .carbs
        case .fat: .fat
        case .fiber: .fiber
        }
    }

    func value(_ food: TopFoodEntry) -> Double {
        switch self {
        case .protein: food.protein
        case .carbs: food.carbs
        case .fat: food.fat
        case .fiber: food.fiber
        }
    }

    func value(_ day: DailyStatsEntry) -> Double {
        switch self {
        case .protein: day.protein
        case .carbs: day.carbs
        case .fat: day.fat
        case .fiber: day.fiber
        }
    }
}

/// The foods behind one Macro Balance axis: which ones contributed the most of
/// it over the selected range, and their share of the period's total.
struct MacroSourcesSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    let days: Int
    let dailyStats: [DailyStatsEntry]
    let macro: MacroKind

    @State private var foods: [TopFoodEntry]?
    @State private var errorMessage: String?

    /// Summed over the same window the server's top-foods uses (today and the
    /// `days - 1` before it), so the shares line up with the listed totals.
    private var periodTotal: Double {
        let cutoff = DateFormatting.isoString(from: Date().adding(days: -(days - 1)))
        return dailyStats.filter { $0.date >= cutoff }.map { macro.value($0) }.reduce(0, +)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    content
                } header: {
                    Text(L10n.macroSourcesSubtitle(days: days))
                        .textCase(nil)
                }
            }
            .navigationTitle("\(L10n.macroSourcesTitle): \(macro.label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.done) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if let errorMessage {
            InsightEmptyState(message: errorMessage)
        } else if let foods {
            if foods.isEmpty {
                InsightEmptyState(message: L10n.macroSourcesEmpty)
            } else {
                let total = periodTotal
                ForEach(Array(foods.enumerated()), id: \.element.id) { index, food in
                    sourceRow(rank: index + 1, food: food, periodTotal: total)
                }
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
        }
    }

    private func sourceRow(rank: Int, food: TopFoodEntry, periodTotal: Double) -> some View {
        let amount = macro.value(food) * Double(food.count)
        let share = periodTotal > 0 ? min(amount / periodTotal, 1) : 0

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(rank).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 22, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(food.foodName)
                        .lineLimit(1)
                    Text("\(food.count)× · \(amount.formatted(.number.precision(.fractionLength(0 ... 1)))) g")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(Int((share * 100).rounded()))%")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .foregroundStyle(
                            AccessibleMacroColor.color(macro.accessibleMacro, colorScheme: colorScheme, contrast: colorSchemeContrast)
                        )
                    Text(L10n.macroSourcesShareHint)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.systemGray5))
                    Capsule().fill(macro.color)
                        .frame(width: geo.size.width * share)
                }
            }
            .frame(height: 4)
            .padding(.leading, 22)
            .accessibilityHidden(true)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do {
            foods = try await api.getTopFoods(days: days, limit: 10, sort: macro.rawValue)
        } catch {
            // Dismissing the sheet mid-load cancels it; that isn't a failure.
            if Task.isCancelled { return }
            errorMessage = error.localizedDescription
        }
    }
}
