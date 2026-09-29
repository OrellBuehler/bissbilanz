import SwiftUI

/// Export foods and recipes as one shareable zip — the iOS counterpart of the
/// web's FoodPackageExportDialog. Presented as a sheet from the foods list
/// (everything, by brand/label, or the foods picked in multi-select) and from
/// a recipe (that recipe only).
struct FoodPackageExportView: View {
    enum Mode: Hashable { case all, filter, selected }

    struct FacetOption: Identifiable {
        let value: String
        let count: Int
        var id: String { value }
    }

    /// Pre-selected recipes (sharing one recipe); empty for the foods list.
    var recipeIds: [String] = []
    /// Pre-selected foods (the foods list's multi-select); empty otherwise.
    var foodIds: [String] = []

    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appMode
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var mode: Mode
    @State private var includeRecipes: Bool
    @State private var brands: Set<String> = []
    @State private var labels: Set<String> = []
    @State private var facetQuery = ""
    @State private var brandOptions: [FoodBrandStat] = []
    @State private var labelOptions: [FoodLabelStat] = []
    @State private var summary: FoodPackageSummary?
    @State private var loadingSummary = false
    @State private var exporting = false
    @State private var exported: ExportedArchive?
    @State private var errorMessage: String?

    init(recipeIds: [String] = [], foodIds: [String] = []) {
        self.recipeIds = recipeIds
        self.foodIds = foodIds
        _mode = State(initialValue: recipeIds.isEmpty && foodIds.isEmpty ? .all : .selected)
        // Picked foods export just those unless the user opts into the recipes
        // using them, like the web dialog.
        _includeRecipes = State(initialValue: foodIds.isEmpty)
    }

    private var recipesOnly: Bool { !recipeIds.isEmpty }
    private var hasPreselection: Bool { !recipeIds.isEmpty || !foodIds.isEmpty }

    private var backend: any FoodPackageBackend {
        FoodPackageBackends.make(
            appMode: appMode, api: api, foodRepository: foodRepository,
            recipeRepository: recipeRepository, context: modelContext
        )
    }

    private var selection: FoodPackageSelection? {
        switch mode {
        case .all:
            recipesOnly
                ? FoodPackageSelection(includeRecipes: "all")
                : FoodPackageSelection(all: true, includeRecipes: includeRecipes ? "all" : "none")
        case .selected:
            FoodPackageSelection(
                foodIds: foodIds.isEmpty ? nil : foodIds,
                recipeIds: recipeIds.isEmpty ? nil : recipeIds,
                includeRecipes: includeRecipes && !foodIds.isEmpty ? "related" : "none"
            )
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
                        if hasPreselection {
                            Text(L10n.foodPackageModeSelected(recipeIds.count + foodIds.count)).tag(Mode.selected)
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
            .facetSearchable(isEnabled: mode == .filter, text: $facetQuery, prompt: L10n.search)
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
        let query = facetQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let visible = query.isEmpty ? options : options.filter { $0.value.localizedCaseInsensitiveContains(query) }
        return Section(title) {
            if options.isEmpty {
                Text(L10n.foodPackageFilterEmpty).foregroundStyle(.secondary)
            } else if visible.isEmpty {
                Text(L10n.foodPackageFilterNoMatch).foregroundStyle(.secondary)
            }
            ForEach(visible) { option in
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
            let source = backend
            brandOptions = try await source.brandStats()
            labelOptions = try await source.labelStats()
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
            summary = try await backend.summarize(selection)
        } catch {
            summary = nil
            errorMessage = FoodPackageErrorText.message(for: error, fallback: nil)
        }
        loadingSummary = false
    }

    private func export() async {
        guard let selection else { return }
        exporting = true
        defer { exporting = false }
        do {
            let package = try await backend.export(selection)
            let url = try FoodPackageShareFile.write(package)
            exported = ExportedArchive(url: url)
        } catch let error as FoodPackageError {
            errorMessage = FoodPackageErrorText.message(for: error)
        } catch {
            errorMessage = L10n.foodPackageExportFailed
            ErrorReporter.capture(error)
        }
    }
}

/// The package as a file the share sheet can send. The file carries the package's own
/// name (`Lasagne.bissbilanz`), because that is what WhatsApp, Mail and Messages show —
/// each export gets a fresh folder so two packages of the same name never collide.
enum FoodPackageShareFile {
    static func write(
        _ package: FoodPackageExport,
        root: URL = FileManager.default.temporaryDirectory
    ) throws -> URL {
        let base = root.appendingPathComponent("food-package-share", isDirectory: true)
        try? FileManager.default.removeItem(at: base)
        let folder = base.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let name = FoodPackageFilename.safeFileName(package.filename)
            ?? "\(FoodPackageFilename.genericBase(date: Date())).\(FoodPackageFormat.fileExtension)"
        let url = folder.appendingPathComponent(name)
        try package.data.write(to: url, options: .atomic)
        return url
    }
}

private extension View {
    @ViewBuilder
    func facetSearchable(isEnabled: Bool, text: Binding<String>, prompt: String) -> some View {
        if isEnabled {
            searchable(text: text, prompt: prompt)
        } else {
            self
        }
    }
}
