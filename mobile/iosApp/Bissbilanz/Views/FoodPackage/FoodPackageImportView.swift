import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// A Bissbilanz food package: a zip that opens in this app. Declared as an
    /// exported type in `project.yml`, so files named `*.bissbilanz` offer to open here.
    static let foodPackage = UTType(exportedAs: "com.bissbilanz.food-package", conformingTo: .zip)
}

/// Review and import a food package someone shared — the iOS counterpart of the
/// web's FoodPackageImportDialog. In synced mode the file is sent twice (preview,
/// then import with the chosen resolutions), so its bytes are kept here; in local
/// mode the same two steps run against the on-device store.
struct FoodPackageImportView: View {
    /// A package another app handed over (already copied into the temporary
    /// directory); it is analyzed as soon as the view appears.
    var fileURL: URL?
    /// Why a handed-over file could not even be staged.
    var initialError: String?

    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appMode
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository
    @Environment(\.modelContext) private var modelContext

    @State private var showPicker = false
    @State private var fileData: Data?
    @State private var fileName = "package.bissbilanz"
    @State private var preview: FoodPackagePreview?
    @State private var foodActions: [String: FoodPackageAction] = [:]
    @State private var recipeActions: [String: FoodPackageAction] = [:]
    @State private var foodMappings: [String: Food] = [:]
    @State private var pickingItem: FoodPackageNewFoodItem?
    @State private var result: FoodPackageImportResult?
    @State private var analyzing = false
    @State private var importing = false
    @State private var errorMessage: String?

    private static let maxBytes = FoodPackageFormat.maxPackageBytes

    private var backend: any FoodPackageBackend {
        FoodPackageBackends.make(
            appMode: appMode, api: api, foodRepository: foodRepository,
            recipeRepository: recipeRepository, context: modelContext
        )
    }

    var body: some View {
        List {
            if let result {
                resultSection(result)
            } else if analyzing {
                HStack(spacing: 12) {
                    ProgressView()
                    Text(L10n.foodPackageAnalyzing)
                }
            } else if let preview {
                reviewSections(preview)
            } else {
                Section {
                    Text(L10n.foodPackageImportDescription).foregroundStyle(.secondary)
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                    Button {
                        showPicker = true
                    } label: {
                        Label(L10n.foodPackageChooseFile, systemImage: "doc.zipper")
                    }
                }
            }
        }
        .navigationTitle(L10n.foodPackageImportTitle)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if preview != nil, result == nil {
                Button {
                    Task { await commit() }
                } label: {
                    Group {
                        if importing { ProgressView() } else { Text(L10n.foodPackageImportButton) }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(importing || analyzing)
                .padding()
                .background(.bar)
            }
        }
        .fileImporter(isPresented: $showPicker, allowedContentTypes: [.foodPackage, .zip, .json, .data]) { picked in
            Task { await load(picked) }
        }
        .sheet(item: $pickingItem) { item in
            NavigationStack {
                FoodPicker(
                    onPicked: { food in foodMappings[item.ref] = food },
                    dimension: ServingUnit(rawValue: item.servingUnit)?.dimension,
                    allowsOpenFoodFacts: false
                )
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(L10n.cancel) { pickingItem = nil }
                    }
                }
            }
        }
        .task {
            if let initialError {
                errorMessage = initialError
            } else if let fileURL, fileData == nil {
                await load(.success(fileURL))
            }
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func reviewSections(_ preview: FoodPackagePreview) -> some View {
        let foods = preview.conflicts.foods
        let recipes = preview.conflicts.recipes
        let newFoods = preview.newFoods
        Section {
            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
            Text(L10n.foodPackageNewCounts(
                foods: newFoods.items.isEmpty ? newFoods.count : newFoods.items.count,
                recipes: preview.newRecipes.count
            ))
            .font(.subheadline.weight(.medium))
            if newFoods.ingredientOnly > 0 {
                Text(L10n.foodPackageIngredientOnly(newFoods.ingredientOnly))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Text(foods.count + recipes.count > 0
                ? L10n.foodPackageConflictCount(foods.count + recipes.count)
                : L10n.foodPackageNoConflicts)
                .font(.caption).foregroundStyle(.secondary)
            ForEach(Array(preview.issues.enumerated()), id: \.offset) { _, issue in
                Text(issue.message).font(.caption).foregroundStyle(.secondary)
            }
            Button(L10n.foodPackageChooseFile) { showPicker = true }
        }

        if !newFoods.items.isEmpty {
            Section {
                ForEach(newFoods.items) { item in
                    FoodPackageNewFoodRow(
                        item: item,
                        mapped: foodMappings[item.ref],
                        onChoose: { pickingItem = item },
                        onUndo: { foodMappings[item.ref] = nil }
                    )
                }
            } header: {
                Text(L10n.foodPackageNewFoodsHeader(newFoods.items.count - foodMappings.count))
            } footer: {
                Text(L10n.foodPackageNewFoodsFooter)
            }
        }

        if !foods.isEmpty {
            Section {
                if foods.count > 1 {
                    applyAllRow(
                        FoodPackageResolutionModel.common(foods.map(\.resolvable), state: foodActions)
                    ) { action in
                        foodActions = FoodPackageResolutionModel.applyToAll(foods.map(\.resolvable), action: action)
                    }
                }
                ForEach(foods) { conflict in
                    FoodPackageFoodConflictRow(
                        conflict: conflict,
                        action: foodActions[conflict.ref] ?? .skip
                    ) { action in
                        foodActions = FoodPackageResolutionModel.set(
                            foodActions, conflicts: foods.map(\.resolvable), ref: conflict.ref, action: action
                        )
                    }
                }
            } header: {
                Text(L10n.foodPackageTabFoods(foods.count))
            }
        }

        if !recipes.isEmpty {
            Section {
                if recipes.count > 1 {
                    applyAllRow(
                        FoodPackageResolutionModel.common(recipes.map(\.resolvable), state: recipeActions)
                    ) { action in
                        recipeActions = FoodPackageResolutionModel.applyToAll(recipes.map(\.resolvable), action: action)
                    }
                }
                ForEach(recipes) { conflict in
                    FoodPackageRecipeConflictRow(
                        conflict: conflict,
                        action: recipeActions[conflict.ref] ?? .skip
                    ) { action in
                        recipeActions = FoodPackageResolutionModel.set(
                            recipeActions, conflicts: recipes.map(\.resolvable), ref: conflict.ref, action: action
                        )
                    }
                }
            } header: {
                Text(L10n.foodPackageTabRecipes(recipes.count))
            }
        }
    }

    private func applyAllRow(
        _ value: FoodPackageAction?,
        onChange: @escaping (FoodPackageAction) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L10n.foodPackageApplyAll).font(.caption).foregroundStyle(.secondary)
            FoodPackageActionPicker(value: value, allowed: FoodPackageAction.allCases, onChange: onChange)
        }
    }

    private func resultSection(_ result: FoodPackageImportResult) -> some View {
        Section {
            Label(L10n.foodPackageResultTitle, systemImage: "checkmark.circle.fill")
                .foregroundStyle(MacroColors.fiber)
            Text(L10n.foodPackageResultFoods(
                created: result.created.foods, replaced: result.replaced.foods,
                keptBoth: result.keptBoth.foods, skipped: result.skipped.foods
            ))
            Text(L10n.foodPackageResultRecipes(
                created: result.created.recipes, replaced: result.replaced.recipes,
                keptBoth: result.keptBoth.recipes, skipped: result.skipped.recipes
            ))
            ForEach(Array(result.issues.enumerated()), id: \.offset) { _, issue in
                Text(issue.message).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Actions

    private func load(_ picked: Result<URL, Error>) async {
        errorMessage = nil
        do {
            let url = try picked.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= Self.maxBytes else {
                errorMessage = L10n.foodPackageFileTooLarge
                return
            }
            fileData = try Data(contentsOf: url)
            fileName = url.lastPathComponent
            await analyze()
        } catch {
            ErrorReporter.capture(error)
            errorMessage = L10n.foodPackageOpenFailed
        }
    }

    private func analyze() async {
        guard let fileData else { return }
        analyzing = true
        defer { analyzing = false }
        do {
            // A file that is no package at all gets the same friendly answer in both
            // modes, and never travels to the server. Anything subtler is left to
            // whoever applies the package (the server words those itself).
            if !appMode.isLocal, let problem = FoodPackageErrorText.obviousProblem(in: fileData) {
                throw problem
            }
            let loaded = try await backend.preview(fileData, filename: fileName)
            preview = loaded
            foodMappings = [:]
            foodActions = FoodPackageResolutionModel.initial(loaded.conflicts.foods.map(\.resolvable))
            recipeActions = FoodPackageResolutionModel.initial(loaded.conflicts.recipes.map(\.resolvable))
        } catch {
            preview = nil
            errorMessage = FoodPackageErrorText.message(for: error, fallback: nil)
        }
    }

    private func commit() async {
        guard let fileData, let preview else { return }
        importing = true
        defer { importing = false }
        errorMessage = nil
        do {
            result = try await backend.importPackage(
                fileData,
                filename: fileName,
                resolutions: FoodPackageResolutionModel.resolutions(
                    for: preview, foods: foodActions, recipes: recipeActions,
                    mappings: foodMappings.mapValues(\.id)
                )
            )
        } catch where FoodPackageErrorText.isStale(error) {
            // The data changed since the preview: review again.
            await analyze()
            if self.preview != nil { errorMessage = L10n.foodPackageStale }
        } catch {
            // Already captured by the API client; keep the reason next to the message.
            ErrorReporter.addBreadcrumb(
                "food package import failed: \(error.localizedDescription)",
                category: "food-package"
            )
            errorMessage = FoodPackageErrorText.message(for: error, fallback: L10n.foodPackageImportFailed)
        }
    }
}

/// What the user is told when a package cannot be read or applied — whichever
/// backend said no.
enum FoodPackageErrorText {
    static func isStale(_ error: Error) -> Bool {
        if case APIError.conflict = error { return true }
        if let error = error as? FoodPackageError {
            return error == .stalePreview || error == .packageChanged
        }
        return false
    }

    /// Why a file is no package at all (wrong kind of file, damaged, a newer format) —
    /// nil when it reads as one, or fails a rule only whoever applies it should judge.
    static func obviousProblem(in data: Data) -> FoodPackageError? {
        guard case let .failure(error) = Result(catching: { try FoodPackageReader.read(data) }),
              let problem = error as? FoodPackageError else { return nil }
        if case .invalid = problem { return nil }
        return problem
    }

    /// `fallback` replaces the raw description of an error nothing else explains.
    static func message(for error: Error, fallback: String?) -> String {
        if let error = error as? FoodPackageError {
            return message(for: error)
        }
        if case let APIError.badRequest(body) = error {
            return serverMessage(body).map(friendly) ?? fallback ?? L10n.foodPackageImportFailed
        }
        return fallback ?? error.localizedDescription
    }

    static func message(for error: FoodPackageError) -> String {
        switch error {
        case .empty: L10n.foodPackageEmptyFile
        case .tooLarge: L10n.foodPackageFileTooLarge
        case .tooManyFiles: L10n.foodPackageTooManyFiles
        case .damaged: L10n.foodPackageDamaged
        case .notAPackage, .missingManifest: L10n.foodPackageNotAPackage
        case .accountExport: L10n.foodPackageAccountExport
        case .newerVersion: L10n.foodPackageNewerVersion
        case let .invalid(detail): L10n.foodPackageInvalid(detail)
        case .stalePreview, .packageChanged: L10n.foodPackageStale
        case let .badRequest(message): message
        case .nothingToExport: L10n.foodPackageNothingSelected
        case .exportTooLarge: L10n.foodPackageTooLarge
        case .tooManyFoods, .tooManyRecipes: L10n.foodPackageTooManyItems
        }
    }

    /// The server words its rejections in English; the ones a user can hit by picking
    /// the wrong file get the localized text instead.
    private static func friendly(_ message: String) -> String {
        if message.hasPrefix("Unrecognized file") || message.contains("does not contain a readable") {
            return L10n.foodPackageNotAPackage
        }
        if message.contains("full account export") { return L10n.foodPackageAccountExport }
        if message.contains("newer version of Bissbilanz") { return L10n.foodPackageNewerVersion }
        if message.contains("damaged") { return L10n.foodPackageDamaged }
        return message
    }

    /// The server's `{ "error": … }` text for a rejected file (e.g. an account export).
    private static func serverMessage(_ body: String?) -> String? {
        guard let data = body?.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = json["error"] as? String,
              message != "Validation failed" else { return nil }
        return message
    }
}

struct FoodPackageActionPicker: View {
    let value: FoodPackageAction?
    let allowed: [FoodPackageAction]
    let onChange: (FoodPackageAction) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(FoodPackageAction.allCases) { action in
                let selected = value == action
                Button {
                    onChange(action)
                } label: {
                    Text(Self.label(action))
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(selected ? .accentColor : .secondary)
                .background(selected ? Color.accentColor.opacity(0.15) : .clear, in: .rect(cornerRadius: 8))
                .disabled(!allowed.contains(action))
            }
        }
    }

    static func label(_ action: FoodPackageAction) -> String {
        switch action {
        case .skip: L10n.foodPackageSkip
        case .replace: L10n.foodPackageReplace
        case .keepBoth: L10n.foodPackageKeepBoth
        }
    }
}

/// One food the import would create, with the way out of it: standing one of the
/// user's own foods in for it. A chosen food is shown with an undo.
private struct FoodPackageNewFoodRow: View {
    let item: FoodPackageNewFoodItem
    let mapped: Food?
    let onChoose: () -> Void
    let onUndo: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(item.name).font(.subheadline.weight(.medium))
                    if item.isIngredient {
                        Text(L10n.foodPackageIngredientBadge)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(.quaternary, in: .capsule)
                    }
                }
                if let brand = item.brand, !brand.isEmpty {
                    Text(brand).font(.caption).foregroundStyle(.secondary)
                }
                Text(detail).font(.caption).foregroundStyle(.secondary)
                if !item.recipes.isEmpty {
                    Text(L10n.foodPackageUsedIn(recipeNames)).font(.caption).foregroundStyle(.secondary)
                }
            }
            .opacity(mapped == nil ? 1 : 0.6)
            .accessibilityElement(children: .combine)

            if let mapped {
                HStack(spacing: 8) {
                    Label(L10n.foodPackageWillUse(mapped.name), systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(MacroColors.fiber)
                    Spacer(minLength: 8)
                    Button(action: onUndo) {
                        Label(L10n.foodPackageUndoMapping, systemImage: "arrow.uturn.backward")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityHint(L10n.foodPackageUndoMappingHint(item.name))
                }
            } else {
                Button(action: onChoose) {
                    Label(L10n.foodPackageUseMyFood, systemImage: "arrow.left.arrow.right")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityHint(L10n.foodPackageUseMyFoodHint(item.name))
            }
        }
        .padding(.vertical, 4)
    }

    private var detail: String {
        let unit = ServingUnit(rawValue: item.servingUnit)?.displayName ?? item.servingUnit
        return "\(MacroFormat.nutrient(item.servingSize)) \(unit) \u{00B7} \(MacroFormat.nutrient(item.calories)) kcal"
    }

    private var recipeNames: String {
        let names = item.recipes.prefix(2).map(\.name).joined(separator: ", ")
        let more = item.recipes.count - 2
        return more > 0 ? "\(names) +\(more)" : names
    }
}

private struct FoodPackageFoodConflictRow: View {
    let conflict: FoodPackageFoodConflict
    let action: FoodPackageAction
    let onChange: (FoodPackageAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(reasonLabel)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(.quaternary, in: .capsule)
            if !conflict.alsoMatches.isEmpty {
                Text(L10n.foodPackageAlsoMatches(conflict.alsoMatches.map(\.name).joined(separator: ", ")))
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack(alignment: .top, spacing: 8) {
                FoodPackageFoodSide(title: L10n.foodPackageIncoming, item: conflict.incoming)
                FoodPackageFoodSide(title: L10n.foodPackageExisting, item: conflict.existing.summary)
            }
            FoodPackageActionPicker(value: action, allowed: conflict.allowed, onChange: onChange)
            ForEach(notes, id: \.self) { note in
                Label(note, systemImage: "info.circle")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var reasonLabel: String {
        switch conflict.reason {
        case "barcode": L10n.foodPackageReasonBarcode
        case "name_brand": L10n.foodPackageReasonName
        default: L10n.foodPackageReasonBarcodeAndName
        }
    }

    private var notes: [String] {
        conflict.notes.compactMap { note -> String? in
            switch note {
            case "replace_changes_history":
                L10n.foodPackageNoteHistory(
                    entries: conflict.existing.entryCount,
                    recipes: conflict.existing.recipeCount
                )
            case "replace_unit_blocked": L10n.foodPackageNoteUnitBlocked
            case "barcode_dropped_on_keep_both": action == .keepBoth ? L10n.foodPackageNoteBarcodeDropped : nil
            case "skip_may_copy_for_recipe": action == .skip ? L10n.foodPackageNoteSkipCopy : nil
            case "shared_target": L10n.foodPackageNoteSharedTarget
            default: nil
            }
        }
    }
}

private struct FoodPackageRecipeConflictRow: View {
    let conflict: FoodPackageRecipeConflict
    let action: FoodPackageAction
    let onChange: (FoodPackageAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                side(L10n.foodPackageIncoming, name: conflict.incoming.name,
                     ingredients: conflict.incoming.ingredients, imageUrl: conflict.incoming.imageUrl)
                side(L10n.foodPackageExisting, name: conflict.existing.name,
                     ingredients: conflict.existing.ingredients, imageUrl: conflict.existing.imageUrl)
            }
            FoodPackageActionPicker(value: action, allowed: conflict.allowed, onChange: onChange)
            if conflict.notes.contains("replace_changes_history") {
                Label(L10n.foodPackageNoteRecipeHistory(conflict.existing.entryCount), systemImage: "info.circle")
                    .font(.caption).foregroundStyle(action == .replace ? .red : .secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func side(_ title: String, name: String, ingredients: [String], imageUrl: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption2).foregroundStyle(.secondary)
            FoodPackageThumbnail(imageUrl: imageUrl)
            Text(name).font(.subheadline.weight(.medium)).lineLimit(2)
            Text(L10n.foodPackageIngredients(ingredients.count)).font(.caption).foregroundStyle(.secondary)
            Text(ingredients.joined(separator: ", ")).font(.caption2).foregroundStyle(.secondary).lineLimit(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 8))
    }
}

private struct FoodPackageFoodSide: View {
    let title: String
    let item: FoodPackageFoodSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption2).foregroundStyle(.secondary)
            FoodPackageThumbnail(imageUrl: item.imageUrl)
            Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2)
            if let brand = item.brand {
                Text(brand).font(.caption).foregroundStyle(.secondary)
            }
            Text("\(Self.fmt(item.servingSize)) \(item.servingUnit.replacingOccurrences(of: "_", with: " "))")
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 4) {
                Text("\(Self.fmt(item.calories)) kcal").foregroundStyle(MacroColors.calories)
                Text("\(Self.fmt(item.protein))P").foregroundStyle(MacroColors.protein)
                Text("\(Self.fmt(item.carbs))C").foregroundStyle(MacroColors.carbs)
                Text("\(Self.fmt(item.fat))F").foregroundStyle(MacroColors.fat)
            }
            .font(.caption2.monospacedDigit())
            if let barcode = item.barcode {
                Text(barcode).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 8))
    }

    static func fmt(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}

/// Incoming thumbnails arrive as small inline `data:` URLs; existing images load
/// through `FoodImageView` (authenticated server uploads, public URLs and, in
/// local mode, photos stored on the device).
private struct FoodPackageThumbnail: View {
    let imageUrl: String?

    var body: some View {
        if let imageUrl {
            Group {
                if imageUrl.hasPrefix("data:"),
                   let comma = imageUrl.firstIndex(of: ","),
                   let data = Data(base64Encoded: String(imageUrl[imageUrl.index(after: comma)...])),
                   let image = UIImage(data: data)
                {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    FoodImageView(imageUrl: imageUrl)
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(.rect(cornerRadius: 6))
        }
    }
}
