import SwiftUI

/// The foods handed to `FoodMergeSheet`, as a `sheet(item:)` payload.
struct FoodMergeCandidates: Identifiable {
    let id = UUID()
    let foods: [Food]
    var keeperId: String?
}

/// Review step for `POST /api/foods/merge`, shared by duplicate detection, the
/// food detail's "Merge into…" and the Foods tab's multi-select. The user picks
/// the food to keep, then sees what the merged food ends up with: a summary of
/// the fields that matter for tracking (with every difference one tap away),
/// or a git-style diff of every field where any dropped value can be taken
/// instead. The preview mirrors the server's merge rules via `FoodMergePlan`.
struct FoodMergeSheet: View {
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    let foods: [Food]
    var onMerged: (Food) -> Void

    @State private var keeperId: String
    /// Field key → id of the food whose value the user picked in the diff.
    @State private var overrides: [String: String] = [:]
    @State private var mode: Mode = .summary
    @State private var showsAllDifferences = false
    @State private var isMerging = false
    @State private var errorMessage: String?

    private enum Mode {
        case summary
        case diff
    }

    init(candidates: FoodMergeCandidates, onMerged: @escaping (Food) -> Void) {
        foods = candidates.foods
        self.onMerged = onMerged
        let initial = candidates.keeperId
            ?? candidates.foods.first(where: \.isFavorite)?.id
            ?? candidates.foods.first?.id
            ?? ""
        _keeperId = State(initialValue: initial)
    }

    private var diffs: [FoodMergeFieldDiff] {
        FoodMergePlan.diffs(foods: foods, keeperId: keeperId, overrides: overrides)
            .filter(\.differs)
    }

    private var servingsDiffer: Bool {
        Set(foods.map { "\($0.servingSize) \($0.servingUnit.rawValue)" }).count > 1
    }

    var body: some View {
        let diffs = self.diffs
        NavigationStack {
            List {
                keeperSection
                overviewSection(diffs)
                if !diffs.isEmpty {
                    switch mode {
                    case .summary: summarySections(diffs)
                    case .diff: diffSections(diffs)
                    }
                }
            }
            .navigationTitle(L10n.foodsMergeTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                        .disabled(isMerging)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isMerging {
                        ProgressView()
                    } else {
                        Button(L10n.foodsMergeConfirm) {
                            Task { await merge() }
                        }
                        .fontWeight(.semibold)
                        .disabled(foods.count < 2)
                    }
                }
            }
            .interactiveDismissDisabled(isMerging)
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
    }

    // MARK: - Keeper

    private var keeperSection: some View {
        Section {
            ForEach(foods) { food in
                Button {
                    guard keeperId != food.id else { return }
                    keeperId = food.id
                    overrides = [:]
                } label: {
                    keeperRow(food)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(food.id == keeperId ? .isSelected : [])
            }
        } header: {
            Text(L10n.foodMergeKeepSection)
        } footer: {
            Text(L10n.foodMergeKeepFooter)
        }
    }

    private func keeperRow(_ food: Food) -> some View {
        let isKeeper = food.id == keeperId
        return HStack(spacing: 12) {
            Image(systemName: isKeeper ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(isKeeper ? Color.accentColor : .secondary)
                .accessibilityHidden(true)
            tagBadge(food)
            VStack(alignment: .leading, spacing: 2) {
                Text(food.name)
                    .foregroundStyle(.primary)
                if let brand = food.brand, !brand.isEmpty {
                    Text(brand)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 4) {
                    Text("\(MacroFormat.kcal(food.calories)) kcal")
                        .foregroundStyle(macroColor(.calories))
                    Text("P\(MacroFormat.nutrient(food.protein))")
                        .foregroundStyle(macroColor(.protein))
                    Text("C\(MacroFormat.nutrient(food.carbs))")
                        .foregroundStyle(macroColor(.carbs))
                    Text("F\(MacroFormat.nutrient(food.fat))")
                        .foregroundStyle(macroColor(.fat))
                    Text("· \(MacroFormat.nutrient(food.servingSize)) \(food.servingUnit.displayName)")
                        .foregroundStyle(.secondary)
                }
                .font(.caption)
                .monospacedDigit()
            }
            Spacer(minLength: 8)
            Text(isKeeper ? L10n.foodMergeKeepBadge : L10n.foodMergeRemoveBadge)
                .font(.caption.weight(.medium))
                .foregroundStyle(isKeeper ? Color.accentColor : .secondary)
        }
        .contentShape(Rectangle())
    }

    // MARK: - Overview

    private func overviewSection(_ diffs: [FoodMergeFieldDiff]) -> some View {
        Section {
            if !diffs.isEmpty {
                Picker("", selection: $mode) {
                    Text(L10n.foodMergeModeSummary).tag(Mode.summary)
                    Text(L10n.foodMergeModeDiff).tag(Mode.diff)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        } header: {
            Text(L10n.foodMergeDifferenceCount(diffs.count))
                .font(.headline)
                .foregroundStyle(.primary)
                .textCase(nil)
        } footer: {
            if diffs.isEmpty {
                Text(L10n.foodMergeIdentical)
            } else if servingsDiffer {
                Text(L10n.foodMergeServingMismatch)
            }
        }
    }

    // MARK: - Summary

    @ViewBuilder
    private func summarySections(_ diffs: [FoodMergeFieldDiff]) -> some View {
        let keyDiffs = diffs.filter { FoodMergePlan.keyFieldKeys.contains($0.key) }
        let shown = showsAllDifferences ? diffs : keyDiffs
        Section(showsAllDifferences ? L10n.foodMergeAllDifferences : L10n.foodMergeKeyDifferences) {
            if shown.isEmpty {
                Text(L10n.foodMergeNoKeyDifferences)
                    .foregroundStyle(.secondary)
            }
            ForEach(shown) { diff in
                summaryRow(diff)
            }
            if diffs.count > keyDiffs.count {
                Button {
                    withAnimation { showsAllDifferences.toggle() }
                } label: {
                    Label(
                        showsAllDifferences ? L10n.foodMergeShowKeyOnly : L10n.foodMergeShowAll(diffs.count),
                        systemImage: showsAllDifferences ? "chevron.up" : "chevron.down"
                    )
                }
            }
        }
    }

    private func summaryRow(_ diff: FoodMergeFieldDiff) -> some View {
        let resultFood = food(diff.resultFoodId)
        let dropped = foods.filter { diff.values[$0.id] != diff.result }
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(label(diff.key))
                Spacer()
                valueView(diff.result, key: diff.key, food: resultFood)
                    .fontWeight(.semibold)
            }
            ForEach(dropped) { food in
                HStack(spacing: 6) {
                    tagBadge(food)
                    valueView(diff.values[food.id] ?? .empty, key: diff.key, food: food)
                        .strikethrough()
                        .foregroundStyle(.secondary)
                }
                .font(.caption)
            }
            if diff.resultFoodId != keeperId, let resultFood {
                Text(diff.isOverridden
                    ? L10n.foodMergeTakenFrom("\(tag(resultFood)) · \(resultFood.name)")
                    : L10n.foodMergeFilledFrom("\(tag(resultFood)) · \(resultFood.name)"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Diff

    @ViewBuilder
    private func diffSections(_ diffs: [FoodMergeFieldDiff]) -> some View {
        ForEach(diffs) { diff in
            Section(label(diff.key)) {
                ForEach(foods) { food in
                    diffLine(diff, food: food)
                }
            }
        }
        Section {} footer: {
            Text(L10n.foodMergeDiffFooter)
        }
    }

    private func diffLine(_ diff: FoodMergeFieldDiff, food: Food) -> some View {
        let value = diff.values[food.id] ?? .empty
        let isKept = value == diff.result
        let canPick = !isKept && !value.isEmpty
            && FoodMergePlan.canPick(key: diff.key, from: food.id, foods: foods, keeperId: keeperId)
        let tint: Color = isKept ? .green : .red
        return Button {
            guard canPick else { return }
            pick(diff.key, from: food.id)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: isKept ? "plus" : "minus")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tint)
                    .frame(width: 14)
                    .accessibilityHidden(true)
                tagBadge(food)
                valueView(value, key: diff.key, food: food)
                    .font(.system(.subheadline, design: .monospaced))
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isKept, diff.resultFoodId == food.id {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(tint)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(tint.opacity(colorScheme == .dark ? 0.18 : 0.1))
        .accessibilityAddTraits(isKept ? .isSelected : [])
    }

    /// Takes `key` from `foodId`, or drops the pick when that value is what
    /// the merge would produce on its own anyway.
    private func pick(_ key: String, from foodId: String) {
        let automatic = FoodMergePlan.diffs(foods: foods, keeperId: keeperId)
            .first { $0.key == key }
        if let automatic, automatic.values[foodId] == automatic.result {
            overrides.removeValue(forKey: key)
        } else {
            overrides[key] = foodId
        }
    }

    // MARK: - Merge

    private func merge() async {
        guard !isMerging else { return }
        isMerging = true
        defer { isMerging = false }
        let sourceIds = foods.map(\.id).filter { $0 != keeperId }
        let overrideValues = FoodMergePlan.overrideValues(foods: foods, keeperId: keeperId, overrides: overrides)
        do {
            let merged = try await foodRepository.mergeFoods(
                keeperId: keeperId,
                sourceIds: sourceIds,
                overrides: overrideValues
            )
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            dismiss()
            onMerged(merged)
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            errorMessage = L10n.foodsMergeFailed
        }
    }

    // MARK: - Formatting

    private func food(_ id: String) -> Food? {
        foods.first { $0.id == id }
    }

    /// "A", "B", … — duplicates often share a name, so rows refer to each
    /// food by the letter shown next to it in the keeper list.
    private func tag(_ food: Food) -> String {
        let index = foods.firstIndex(where: { $0.id == food.id }) ?? 0
        return String(Character(UnicodeScalar(UInt8(65 + index % 26))))
    }

    private func tagBadge(_ food: Food) -> some View {
        Text(tag(food))
            .font(.caption2.weight(.bold))
            .foregroundStyle(food.id == keeperId ? Color.white : .secondary)
            .frame(width: 20, height: 20)
            .background(
                Circle().fill(food.id == keeperId ? Color.accentColor : Color.secondary.opacity(0.2))
            )
            .accessibilityLabel(food.name)
    }

    @ViewBuilder
    private func valueView(_ value: FoodMergeValue, key: String, food: Food?) -> some View {
        if key == "imageUrl", case let .text(url) = value {
            FoodImageView(imageUrl: url)
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .accessibilityLabel(L10n.foodMergePhoto)
        } else {
            Text(display(value, key: key, food: food))
                .multilineTextAlignment(.leading)
                .lineLimit(key == "ingredientsText" ? 3 : 2)
        }
    }

    private func display(_ value: FoodMergeValue, key: String, food: Food?) -> String {
        switch value {
        case .empty:
            return "—"
        case let .flag(flag):
            return flag ? L10n.foodMergeYes : L10n.foodMergeNo
        case let .list(items):
            return items.joined(separator: ", ")
        case let .text(text):
            if key == "servingUnit" { return ServingUnit(rawValue: text)?.displayName ?? text }
            return text
        case let .number(number):
            if key == "servingSize" {
                return "\(MacroFormat.nutrient(number)) \(food?.servingUnit.displayName ?? "")"
            }
            if key == "novaGroup" { return "\(Int(number))" }
            if let unit = unit(for: key) { return "\(MacroFormat.nutrient(number)) \(unit)" }
            return MacroFormat.nutrient(number)
        }
    }

    private func unit(for key: String) -> String? {
        switch key {
        case "calories": "kcal"
        case "protein", "carbs", "fat", "fiber": "g"
        default: NutrientCatalog.all.first { $0.key == key }?.unit
        }
    }

    private func label(_ key: String) -> String {
        switch key {
        case "name": L10n.name
        case "brand": L10n.brand
        case "servingSize": L10n.servingSize
        case "servingUnit": L10n.foodMergeServingUnit
        case "barcode": L10n.barcode
        case "isFavorite": L10n.favorite
        case "nutriScore": L10n.nutriScore
        case "novaGroup": L10n.novaGroup
        case "additives": L10n.additives
        case "ingredientsText": L10n.ingredients
        case "imageUrl": L10n.foodMergePhoto
        default: nutrientDisplayName(key)
        }
    }

    private func macroColor(_ macro: AccessibleMacroColor.Macro) -> Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }
}
