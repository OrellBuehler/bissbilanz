import SwiftUI

/// Reorder/visibility editor for the dashboard's widgets — Apple's Health/
/// Fitness "Edit" pattern: a `List` pinned into edit mode so the grip handles
/// on the trailing edge come for free from `.onMove`, plus a `Toggle` per row
/// for visibility. `DashboardSection.isDashboardCard` is the single source of
/// truth for which keys get a row here and on the dashboard itself — `summary`
/// (the macro header) and `streaks` (no dashboard card exists) never do.
struct DashboardLayoutView: View {
    @Environment(PreferencesRepository.self) private var preferencesRepository

    @State private var preferences: Preferences = .defaults
    @State private var order: [String] = []
    @State private var errorMessage: String?

    private var rows: [DashboardSection] {
        order.filter(isRow).compactMap(DashboardSection.init(rawValue:))
    }

    var body: some View {
        List {
            ForEach(rows, id: \.self) { section in
                row(for: section)
            }
            .onMove(perform: move)
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle(L10n.dashboardLayout)
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func row(for section: DashboardSection) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title(for: section))
                Text(description(for: section))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            Spacer()
            if section.hasVisibilityToggle {
                Toggle("", isOn: Binding(
                    get: { section.isEnabled(in: preferences) },
                    set: { newValue in Task { await setEnabled(section, newValue) } }
                ))
                .labelsHidden()
                .accessibilityLabel(title(for: section))
            }
        }
        .moveDisabled(false)
    }

    // MARK: - Data

    private func isRow(_ key: String) -> Bool {
        DashboardSection(rawValue: key)?.isDashboardCard ?? false
    }

    private func load() {
        preferences = preferencesRepository.preferences() ?? .defaults
        order = preferences.widgetOrder.isEmpty ? DashboardSection.defaultOrder : preferences.widgetOrder
    }

    /// `onMove` reports indices into `rows` (the sections that actually get a
    /// row), so the move is applied to that same filtered view of `order`
    /// first. Keys without a row — `summary`, `streaks`, and any future
    /// server key this build doesn't recognize yet — are then reinserted at
    /// the absolute index they held before the move: their own position
    /// doesn't affect rendering, so keeping them roughly where they were is
    /// enough, and nothing is ever dropped from the round-trip.
    private func move(from source: IndexSet, to destination: Int) {
        var visible = order.filter(isRow)
        visible.move(fromOffsets: source, toOffset: destination)

        var result = visible
        for (index, key) in order.enumerated() where !isRow(key) {
            result.insert(key, at: min(index, result.count))
        }
        order = result
        Task { await persistOrder() }
    }

    private func persistOrder() async {
        var update = PreferencesUpdate()
        update.widgetOrder = order
        do {
            preferences = try await preferencesRepository.update(update)
            order = preferences.widgetOrder
        } catch {
            ErrorReporter.captureWarning(
                "Dashboard layout reorder failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            errorMessage = L10n.error
            let restored = preferencesRepository.preferences() ?? preferences
            preferences = restored
            order = restored.widgetOrder.isEmpty ? DashboardSection.defaultOrder : restored.widgetOrder
        }
    }

    private func setEnabled(_ section: DashboardSection, _ value: Bool) async {
        var update = PreferencesUpdate()
        section.applyVisibility(value, to: &update)
        do {
            preferences = try await preferencesRepository.update(update)
        } catch {
            ErrorReporter.captureWarning(
                "Dashboard widget toggle failed",
                context: ["reason": ErrorReporter.reason(for: error), "section": section.rawValue]
            )
            errorMessage = L10n.error
            preferences = preferencesRepository.preferences() ?? preferences
        }
    }

    // MARK: - Copy

    private func title(for section: DashboardSection) -> String {
        switch section {
        case .fasting: L10n.fasting
        case .dayProperties: L10n.dashboardSectionDayDetailsTitle
        case .chart: L10n.caloriesTrend
        case .favorites: L10n.favorites
        case .recipeSuggestions: L10n.recipeSuggestions
        case .supplements: L10n.supplements
        case .weight: L10n.weight
        case .mealBreakdown: L10n.mealBreakdown
        case .topFoods: L10n.topFoods
        case .sleep: L10n.sleep
        case .daylog: L10n.dashboardSectionDayLogTitle
        case .streaks, .summary: ""
        }
    }

    private func description(for section: DashboardSection) -> String {
        switch section {
        case .fasting: L10n.dashboardSectionFastingDescription
        case .dayProperties: L10n.dashboardSectionDayDetailsDescription
        case .chart: L10n.dashboardSectionChartDescription
        case .favorites: L10n.dashboardSectionFavoritesDescription
        case .recipeSuggestions: L10n.dashboardSectionRecipeSuggestionsDescription
        case .supplements: L10n.dashboardSectionSupplementsDescription
        case .weight: L10n.dashboardSectionWeightDescription
        case .mealBreakdown: L10n.dashboardSectionMealBreakdownDescription
        case .topFoods: L10n.dashboardSectionTopFoodsDescription
        case .sleep: L10n.dashboardSectionSleepDescription
        case .daylog: L10n.dashboardSectionDayLogDescription
        case .streaks, .summary: ""
        }
    }
}
