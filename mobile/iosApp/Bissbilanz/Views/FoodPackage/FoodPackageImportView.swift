import SwiftUI
import UniformTypeIdentifiers

/// Review and import a food package someone shared — the iOS counterpart of the
/// web's FoodPackageImportDialog. The file is sent twice (preview, then import
/// with the chosen resolutions), so its bytes are kept here.
struct FoodPackageImportView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(FoodRepository.self) private var foodRepository
    @Environment(RecipeRepository.self) private var recipeRepository

    @State private var showPicker = false
    @State private var fileData: Data?
    @State private var fileName = "package.zip"
    @State private var preview: FoodPackagePreview?
    @State private var foodActions: [String: FoodPackageAction] = [:]
    @State private var recipeActions: [String: FoodPackageAction] = [:]
    @State private var result: FoodPackageImportResult?
    @State private var analyzing = false
    @State private var importing = false
    @State private var errorMessage: String?

    private static let maxBytes = 50 * 1024 * 1024

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
        .fileImporter(isPresented: $showPicker, allowedContentTypes: [.zip, .json, .data]) { picked in
            Task { await load(picked) }
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func reviewSections(_ preview: FoodPackagePreview) -> some View {
        let foods = preview.conflicts.foods
        let recipes = preview.conflicts.recipes
        Section {
            Text(L10n.foodPackageNewCounts(foods: preview.newFoods.count, recipes: preview.newRecipes.count))
                .font(.subheadline.weight(.medium))
            if preview.newFoods.ingredientOnly > 0 {
                Text(L10n.foodPackageIngredientOnly(preview.newFoods.ingredientOnly))
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
            errorMessage = L10n.foodPackageImportFailed
        }
    }

    private func analyze() async {
        guard let fileData else { return }
        analyzing = true
        defer { analyzing = false }
        do {
            let loaded = try await api.previewFoodPackage(fileData, filename: fileName)
            preview = loaded
            foodActions = FoodPackageResolutionModel.initial(loaded.conflicts.foods.map(\.resolvable))
            recipeActions = FoodPackageResolutionModel.initial(loaded.conflicts.recipes.map(\.resolvable))
        } catch let APIError.badRequest(body) {
            preview = nil
            errorMessage = Self.serverMessage(body) ?? L10n.foodPackageImportFailed
        } catch {
            preview = nil
            errorMessage = error.localizedDescription
        }
    }

    private func commit() async {
        guard let fileData, let preview else { return }
        importing = true
        defer { importing = false }
        do {
            result = try await api.importFoodPackage(
                fileData,
                filename: fileName,
                resolutions: FoodPackageResolutionModel.resolutions(
                    for: preview, foods: foodActions, recipes: recipeActions
                )
            )
            // Pull the new and replaced rows into the local store.
            do {
                try await foodRepository.mirrorAll()
                try await recipeRepository.refresh()
            } catch {
                ErrorReporter.capture(error)
            }
        } catch APIError.conflict {
            // The account changed since the preview: review again.
            errorMessage = L10n.foodPackageStale
            await analyze()
        } catch {
            // Already captured by the API client; keep the reason next to the message.
            ErrorReporter.addBreadcrumb(
                "food package import failed: \(error.localizedDescription)",
                category: "food-package"
            )
            errorMessage = L10n.foodPackageImportFailed
        }
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
/// through `FoodImageView` (authenticated server uploads and public URLs).
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
