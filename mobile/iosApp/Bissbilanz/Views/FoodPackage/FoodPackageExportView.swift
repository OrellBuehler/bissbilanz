import SwiftUI

/// Export foods and recipes as one shareable zip — the iOS counterpart of the
/// web's FoodPackageExportDialog. Presented as a sheet from the foods list
/// (everything, or by brand/label) and from a recipe (that recipe only).
struct FoodPackageExportView: View {
    enum Mode: Hashable { case all, filter, selected }

    struct FacetOption: Identifiable {
        let value: String
        let count: Int
        var id: String { value }
    }

    /// Pre-selected recipes (sharing one recipe); empty for the foods list.
    var recipeIds: [String] = []

    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    @State private var mode: Mode = .all
    @State private var includeRecipes = true
    @State private var brands: Set<String> = []
    @State private var labels: Set<String> = []
    @State private var brandOptions: [FoodBrandStat] = []
    @State private var labelOptions: [FoodLabelStat] = []
    @State private var summary: FoodPackageSummary?
    @State private var loadingSummary = false
    @State private var exporting = false
    @State private var exported: ExportedArchive?
    @State private var errorMessage: String?

    private var recipesOnly: Bool { !recipeIds.isEmpty }

    private var selection: FoodPackageSelection? {
        switch mode {
        case .all:
            recipesOnly
                ? FoodPackageSelection(includeRecipes: "all")
                : FoodPackageSelection(all: true, includeRecipes: includeRecipes ? "all" : "none")
        case .selected:
            FoodPackageSelection(recipeIds: recipeIds, includeRecipes: "none")
        case .filter:
            brands.isEmpty && labels.isEmpty
                ? nil
                : FoodPackageSelection(
                    brands: brands.isEmpty ? nil : brands.sorted(),
                    labels: labels.isEmpty ? nil : labels.sorted(),
                    includeRecipes: includeRecipes ? "related" : "none"
                )
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L10n.foodPackageMode, selection: $mode) {
                        Text(L10n.foodPackageModeAll).tag(Mode.all)
                        if recipesOnly {
                            Text(L10n.foodPackageModeSelected(recipeIds.count)).tag(Mode.selected)
                        } else {
                            Text(L10n.foodPackageModeFilter).tag(Mode.filter)
                        }
                    }
                    .pickerStyle(.segmented)
                    if !recipesOnly {
                        Toggle(
                            mode == .all ? L10n.foodPackageIncludeRecipes : L10n.foodPackageIncludeRelatedRecipes,
                            isOn: $includeRecipes
                        )
                    }
                } footer: {
                    Text(L10n.foodPackageExportDescription)
                }

                if mode == .filter {
                    facetSection(
                        title: L10n.foodPackageBrands,
                        options: brandOptions.map { FacetOption(value: $0.brand, count: $0.count) },
                        selected: $brands
                    )
                    facetSection(
                        title: L10n.foodPackageLabels,
                        options: labelOptions.map { FacetOption(value: $0.label, count: $0.count) },
                        selected: $labels
                    )
                }

                Section {
                    summaryView
                }
            }
            .navigationTitle(recipesOnly ? L10n.foodPackageShareRecipe : L10n.foodPackageExportTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if exporting {
                        ProgressView()
                    } else {
                        Button(L10n.foodPackageShare) { Task { await export() } }
                            .disabled(!canExport)
                    }
                }
            }
            .sheet(item: $exported) { archive in
                ShareSheet(url: archive.url)
            }
            .task {
                if recipesOnly { mode = .selected }
            }
            .task(id: mode) {
                if mode == .filter { await loadFacets() }
            }
            .task(id: selection) {
                await refreshSummary()
            }
        }
    }

    private var canExport: Bool {
        guard let summary, selection != nil else { return false }
        return summary.foods + summary.recipes > 0 && !summary.overLimit
    }

    @ViewBuilder
    private var summaryView: some View {
        if let errorMessage {
            Text(errorMessage).foregroundStyle(.red)
        }
        if loadingSummary, summary == nil {
            ProgressView()
        } else if let summary, summary.foods + summary.recipes > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.foodPackageSummary(
                    foods: summary.foods,
                    recipes: summary.recipes,
                    images: summary.images,
                    size: ByteCountFormatter.string(fromByteCount: Int64(summary.estimatedBytes), countStyle: .file)
                ))
                .font(.subheadline.weight(.medium))
                if summary.ingredientFoods > 0 {
                    Text(L10n.foodPackageIngredientsAdded(summary.ingredientFoods))
                        .font(.caption).foregroundStyle(.secondary)
                }
                if summary.overLimit {
                    Text(L10n.foodPackageTooLarge).font(.caption).foregroundStyle(.red)
                }
            }
        } else {
            Text(L10n.foodPackageNothingSelected).foregroundStyle(.secondary)
        }
    }

    private func facetSection(
        title: String,
        options: [FacetOption],
        selected: Binding<Set<String>>
    ) -> some View {
        Section(title) {
            if options.isEmpty {
                Text(L10n.foodPackageFilterEmpty).foregroundStyle(.secondary)
            }
            ForEach(options) { option in
                let value = option.value
                Button {
                    if selected.wrappedValue.contains(value) {
                        selected.wrappedValue.remove(value)
                    } else {
                        selected.wrappedValue.insert(value)
                    }
                } label: {
                    HStack {
                        Text(value).foregroundStyle(.primary)
                        Spacer()
                        Text("\(option.count)").foregroundStyle(.secondary).monospacedDigit()
                        if selected.wrappedValue.contains(value) {
                            Image(systemName: "checkmark").foregroundStyle(.tint)
                        }
                    }
                }
            }
        }
    }

    private func loadFacets() async {
        guard brandOptions.isEmpty, labelOptions.isEmpty else { return }
        do {
            async let brandsResult = api.getFoodBrands()
            async let labelsResult = api.getFoodLabelStats()
            brandOptions = try await brandsResult
            labelOptions = try await labelsResult
        } catch {
            // Already reported by the API client; the lists just stay empty.
            errorMessage = error.localizedDescription
        }
    }

    private func refreshSummary() async {
        guard let selection else {
            summary = nil
            return
        }
        loadingSummary = true
        try? await Task.sleep(nanoseconds: 300_000_000)
        guard !Task.isCancelled else { return }
        do {
            summary = try await api.summarizeFoodPackage(selection)
        } catch {
            summary = nil
            errorMessage = error.localizedDescription
        }
        loadingSummary = false
    }

    private func export() async {
        guard let selection else { return }
        exporting = true
        defer { exporting = false }
        do {
            let data = try await api.exportFoodPackage(selection)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("bissbilanz-foods-\(formatter.string(from: Date())).zip")
            try data.write(to: url, options: .atomic)
            exported = ExportedArchive(url: url)
        } catch {
            errorMessage = L10n.foodPackageExportFailed
            ErrorReporter.capture(error)
        }
    }
}
