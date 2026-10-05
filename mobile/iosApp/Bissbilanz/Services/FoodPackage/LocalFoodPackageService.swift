import Foundation
import SwiftData

/// Food packages without a server: the same export, preview and import the server
/// does (`src/lib/server/food-package/*`), run against the local SwiftData store.
/// In local mode that store is the only database there is, so a package built here
/// opens on the server and in the other apps, and the other way round.
///
/// Every write of an import happens in one `save()`; a failure rolls the context
/// back and removes any photo already written.
@MainActor
final class LocalFoodPackageService {
    private let context: ModelContext
    private let images: any PackageImageStore
    private let now: () -> Date

    init(
        context: ModelContext,
        images: any PackageImageStore = LocalPackageImageStore(),
        now: @escaping () -> Date = { Date() }
    ) {
        self.context = context
        self.images = images
        self.now = now
    }

    // MARK: - Store snapshot

    private struct Snapshot {
        var foods: [Food]
        var recipes: [Recipe]
        var existingFoods: [ExistingFood]
        var existingRecipes: [ExistingRecipe]
        var foodsById: [String: Food]
        var recipesById: [String: Recipe]
    }

    private func milliseconds(_ updatedAt: String?, _ createdAt: String?) -> Double {
        guard let text = updatedAt ?? createdAt, let date = DateFormatting.isoDateTime(from: text) else { return 0 }
        return date.timeIntervalSince1970 * 1000
    }

    private func snapshot() -> Snapshot {
        let foods = ((try? context.fetch(FetchDescriptor<LocalFood>())) ?? []).compactMap { $0.toFood() }
        let recipes = ((try? context.fetch(FetchDescriptor<LocalRecipe>())) ?? []).compactMap { $0.toRecipe() }
        var entryCounts: [String: Int] = [:]
        var recipeEntryCounts: [String: Int] = [:]
        for entry in (try? context.fetch(FetchDescriptor<LocalEntry>())) ?? [] {
            if let foodId = entry.foodId { entryCounts[foodId, default: 0] += 1 }
            if let recipeId = entry.recipeId { recipeEntryCounts[recipeId, default: 0] += 1 }
        }
        var recipeCounts: [String: Int] = [:]
        for recipe in recipes {
            for ingredient in recipe.ingredients ?? [] { recipeCounts[ingredient.foodId, default: 0] += 1 }
        }
        var existingFoods: [ExistingFood] = []
        var foodsById: [String: Food] = [:]
        for food in foods {
            foodsById[food.id] = foodsById[food.id] ?? food
            existingFoods.append(ExistingFood(
                id: food.id,
                name: food.name,
                brand: food.brand,
                barcode: food.barcode,
                servingUnit: food.servingUnit,
                updatedAt: milliseconds(food.updatedAt, food.createdAt),
                entryCount: entryCounts[food.id] ?? 0,
                recipeCount: recipeCounts[food.id] ?? 0
            ))
        }
        var existingRecipes: [ExistingRecipe] = []
        var recipesById: [String: Recipe] = [:]
        for recipe in recipes {
            recipesById[recipe.id] = recipesById[recipe.id] ?? recipe
            existingRecipes.append(ExistingRecipe(
                id: recipe.id,
                name: recipe.name,
                updatedAt: milliseconds(recipe.updatedAt, recipe.createdAt),
                entryCount: recipeEntryCounts[recipe.id] ?? 0
            ))
        }
        return Snapshot(
            foods: foods,
            recipes: recipes,
            existingFoods: existingFoods,
            existingRecipes: existingRecipes,
            foodsById: foodsById,
            recipesById: recipesById
        )
    }

    // MARK: - Facets

    func brandStats() -> [FoodBrandStat] {
        var byKey: [String: [String: Int]] = [:]
        for food in snapshot().foods {
            guard let brand = food.brand else { continue }
            let value = FoodPackageText.trimmed(brand)
            guard !value.isEmpty else { continue }
            byKey[value.lowercased(), default: [:]][value, default: 0] += 1
        }
        var groups: [(key: String, stat: FoodBrandStat)] = []
        for (key, variants) in byKey {
            // The spelling most foods use; the smallest one on a tie.
            var display = key
            var best = 0
            for (spelling, count) in variants where count > best || (count == best && spelling < display) {
                display = spelling
                best = count
            }
            let total = variants.values.reduce(0, +)
            groups.append((key: key, stat: FoodBrandStat(brand: display, count: total)))
        }
        groups.sort { lhs, rhs in
            if lhs.stat.count != rhs.stat.count { return lhs.stat.count > rhs.stat.count }
            return lhs.key < rhs.key
        }
        return groups.map(\.stat)
    }

    func labelStats() -> [FoodLabelStat] {
        var counts: [String: Int] = [:]
        for food in snapshot().foods {
            for label in Set(food.labels ?? []) { counts[label, default: 0] += 1 }
        }
        return counts
            .map { FoodLabelStat(label: $0.key, count: $0.value) }
            .sorted { $0.count != $1.count ? $0.count > $1.count : $0.label < $1.label }
    }

    // MARK: - Export

    private struct Selected {
        var foods: [(food: Food, role: PackageFood.Role)]
        var recipes: [Recipe]
    }

    private static func byName(_ lhs: (name: String, id: String), _ rhs: (name: String, id: String)) -> Bool {
        let left = FoodPackageText.normalize(lhs.name)
        let right = FoodPackageText.normalize(rhs.name)
        if left != right { return left < right }
        if lhs.name != rhs.name { return lhs.name < rhs.name }
        return lhs.id < rhs.id
    }

    /// The rows an export request selects. Foods: everything, or the union of `foodIds`
    /// and every food whose brand OR labels match. Recipes: `recipeIds` plus all
    /// (`all`) or the ones using a selected food (`related`). An exported recipe
    /// always brings its ingredient foods along, or it could not be rebuilt.
    private func select(_ selection: FoodPackageSelection, in snapshot: Snapshot) throws -> Selected {
        let includeRecipes = selection.includeRecipes ?? (selection.all == true ? "all" : "none")

        var chosen: [Food] = []
        if selection.all == true {
            chosen = snapshot.foods
        } else {
            let ids = Set(selection.foodIds ?? [])
            let brands = Set((selection.brands ?? []).map { FoodPackageText.trimmed($0).lowercased() })
            let labels = Set(LabelNormalizer.normalizeAll(selection.labels ?? []))
            chosen = snapshot.foods.filter { food in
                if ids.contains(food.id) { return true }
                if !brands.isEmpty, let brand = food.brand,
                   brands.contains(FoodPackageText.trimmed(brand).lowercased())
                {
                    return true
                }
                return !labels.isEmpty && !labels.isDisjoint(with: food.labels ?? [])
            }
        }
        chosen.sort { Self.byName(($0.name, $0.id), ($1.name, $1.id)) }
        guard chosen.count <= FoodPackageFormat.maxFoods else { throw FoodPackageError.tooManyFoods }
        let chosenIds = Set(chosen.map(\.id))

        let recipeIds = Set(selection.recipeIds ?? [])
        var recipes = snapshot.recipes.filter { recipe in
            if includeRecipes == "all" || recipeIds.contains(recipe.id) { return true }
            guard includeRecipes == "related", !chosenIds.isEmpty else { return false }
            return (recipe.ingredients ?? []).contains { chosenIds.contains($0.foodId) }
        }
        recipes.sort { Self.byName(($0.name, $0.id), ($1.name, $1.id)) }
        guard recipes.count <= FoodPackageFormat.maxRecipes else { throw FoodPackageError.tooManyRecipes }

        let foodsById = snapshot.foodsById
        var missing: [String] = []
        var seen = chosenIds
        for recipe in recipes {
            for ingredient in recipe.ingredients ?? [] where seen.insert(ingredient.foodId).inserted {
                missing.append(ingredient.foodId)
            }
        }
        let closure = missing.compactMap { foodsById[$0] }

        var all: [(food: Food, role: PackageFood.Role)] = []
        for food in chosen { all.append((food: food, role: .selected)) }
        for food in closure { all.append((food: food, role: .ingredient)) }
        guard all.count <= FoodPackageFormat.maxFoods else { throw FoodPackageError.tooManyFoods }
        return Selected(foods: all, recipes: recipes)
    }

    func summarize(_ selection: FoodPackageSelection) throws -> FoodPackageSummary {
        let selected = try select(selection, in: snapshot())
        var counted = Set<String>()
        var bytes = 0
        var photos = 0
        let urls: [String?] = selected.foods.map { $0.food.imageUrl } + selected.recipes.map { $0.imageUrl }
        for case let url? in urls where counted.insert(url).inserted {
            if let size = images.size(forImageUrl: url) {
                photos += 1
                bytes += size
            }
        }
        let estimated = bytes + (selected.foods.count + selected.recipes.count) * 1500
        return FoodPackageSummary(
            foods: selected.foods.filter { $0.role == .selected }.count,
            recipes: selected.recipes.count,
            ingredientFoods: selected.foods.filter { $0.role == .ingredient }.count,
            images: photos,
            estimatedBytes: estimated,
            maxBytes: FoodPackageFormat.maxExportBytes,
            overLimit: estimated > FoodPackageFormat.maxExportBytes
        )
    }

    func export(_ selection: FoodPackageSelection) throws -> FoodPackageExport {
        let selected = try select(selection, in: snapshot())
        guard !selected.foods.isEmpty || !selected.recipes.isEmpty else { throw FoodPackageError.nothingToExport }

        let sorted = selected.foods.sorted { Self.byName(($0.food.name, $0.food.id), ($1.food.name, $1.food.id)) }
        let refByFoodId = Dictionary(
            sorted.enumerated().map { ($1.food.id, "f\($0 + 1)") }, uniquingKeysWith: { first, _ in first }
        )

        var entries: [(name: String, data: Data)] = []
        func addImage(_ imageUrl: String?, ref: String) -> String? {
            guard let imageUrl, let raw = images.data(forImageUrl: imageUrl),
                  let image = PackageImageCodec.exportable(raw) else { return nil }
            let path = "images/\(ref).\(image.ext)"
            entries.append((path, image.data))
            return path
        }

        var manifestFoods: [PackageFood] = []
        for (food, role) in sorted {
            let ref = refByFoodId[food.id] ?? ""
            let image = addImage(food.imageUrl, ref: ref)
            manifestFoods.append(packageFood(from: food, ref: ref, role: role, image: image))
        }
        var manifestRecipes: [PackageRecipe] = []
        for (index, recipe) in selected.recipes.enumerated() {
            let ref = "r\(index + 1)"
            let ingredients = (recipe.ingredients ?? []).sorted { $0.sortOrder < $1.sortOrder }.compactMap {
                ingredient -> PackageIngredient? in
                guard let food = refByFoodId[ingredient.foodId] else { return nil }
                return PackageIngredient(food: food, quantity: ingredient.quantity, servingUnit: ingredient.servingUnit)
            }
            manifestRecipes.append(PackageRecipe(
                ref: ref,
                name: recipe.name,
                totalServings: recipe.totalServings,
                cookedWeight: recipe.cookedWeight.flatMap { $0 > 0 ? $0 : nil },
                image: addImage(recipe.imageUrl, ref: ref),
                ingredients: ingredients
            ))
        }

        let manifest = PackageManifest(
            exportedAt: DateFormatting.isoDateTimeString(from: now()),
            foods: manifestFoods,
            recipes: manifestRecipes
        )
        var zip = ZipWriter(date: now())
        try zip.add(name: "README.txt", data: Data(FoodPackageFormat.readme.utf8), compress: true)
        try zip.add(name: FoodPackageFormat.manifestName, data: PackageManifestCoding.encode(manifest), compress: true)
        for entry in entries {
            try zip.add(name: entry.name, data: entry.data, compress: false)
        }
        let data = try zip.finish()
        guard data.count <= FoodPackageFormat.maxExportBytes else { throw FoodPackageError.exportTooLarge }
        return FoodPackageExport(
            data: data,
            filename: FoodPackageFilename.packageFilename(
                recipes: selected.recipes.map(\.name),
                foods: selected.foods.filter { $0.role == .selected }.map { $0.food.name },
                date: now()
            )
        )
    }

    private func packageFood(from food: Food, ref: String, role: PackageFood.Role, image: String?) -> PackageFood {
        let values = (try? JSONPatch.dictionary(of: food)) ?? [:]
        var nutrients: [String: Double] = [:]
        for key in FoodPackageFormat.nutrientKeys {
            if let value = (values[key] as? NSNumber)?.doubleValue { nutrients[key] = value }
        }
        return PackageFood(
            ref: ref,
            role: role,
            name: food.name,
            brand: food.brand,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            nutrients: nutrients,
            barcode: food.barcode,
            nutriScore: food.nutriScore,
            novaGroup: food.novaGroup,
            additives: food.additives,
            ingredientsText: food.ingredientsText,
            labels: food.labels ?? [],
            image: image,
            imageUrl: image == nil ? Self.publicImageUrl(food.imageUrl) : nil
        )
    }

    // MARK: - Preview

    private static let allowedImageHosts: Set<String> = ["images.openfoodfacts.org", "images.openfoodfacts.net"]

    /// An absolute image URL a package may point at: https on an Open Food Facts
    /// host. Anything else — our own paths, `file://`, other hosts — is dropped.
    static func publicImageUrl(_ url: String?) -> String? {
        guard let url, !url.isEmpty, !url.hasPrefix("/"),
              let parsed = URL(string: url), parsed.scheme == "https",
              let host = parsed.host?.lowercased(), allowedImageHosts.contains(host)
        else { return nil }
        return url
    }

    private static func round1(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }

    /// New items and conflicts of a package; writes nothing.
    func preview(_ data: Data) throws -> FoodPackagePreview {
        let file = try FoodPackageReader.read(data)
        let manifest = file.manifest
        let store = snapshot()
        let match = FoodPackageMatcher.match(
            manifest: manifest, existingFoods: store.existingFoods, existingRecipes: store.existingRecipes
        )
        let foodsByRef = Dictionary(manifest.foods.map { ($0.ref, $0) }, uniquingKeysWith: { first, _ in first })
        let recipesByRef = Dictionary(manifest.recipes.map { ($0.ref, $0) }, uniquingKeysWith: { first, _ in first })
        let existingFoods = store.foodsById
        let existingRecipes = store.recipesById
        let stats = Dictionary(
            store.existingFoods.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }
        )
        let recipeEntryCounts = Dictionary(
            store.existingRecipes.map { ($0.id, $0.entryCount) }, uniquingKeysWith: { first, _ in first }
        )

        var wanted: [String] = []
        for conflict in match.foodConflicts {
            if let path = foodsByRef[conflict.ref]?.image, !wanted.contains(path) { wanted.append(path) }
        }
        for conflict in match.recipeConflicts {
            if let path = recipesByRef[conflict.ref]?.image, !wanted.contains(path) { wanted.append(path) }
        }
        var thumbnails: [String: String] = [:]
        for (path, bytes) in file.readImages(Array(wanted.prefix(FoodPackageFormat.maxPreviewThumbnails))) {
            if let url = PackageImageCodec.thumbnailDataURL(from: bytes) { thumbnails[path] = url }
        }

        func incoming(_ food: PackageFood) -> FoodPackageFoodSummary {
            FoodPackageFoodSummary(
                name: food.name,
                brand: food.brand,
                servingSize: food.servingSize,
                servingUnit: food.servingUnit.rawValue,
                calories: Self.round1(food.calories),
                protein: Self.round1(food.protein),
                carbs: Self.round1(food.carbs),
                fat: Self.round1(food.fat),
                fiber: Self.round1(food.fiber),
                barcode: FoodPackageText.trimBarcode(food.barcode),
                labels: food.labels,
                imageUrl: food.image.flatMap { thumbnails[$0] } ?? Self.publicImageUrl(food.imageUrl)
            )
        }

        var foodConflicts: [FoodPackageFoodConflict] = []
        for conflict in match.foodConflicts {
            guard let food = foodsByRef[conflict.ref], let row = existingFoods[conflict.existingId] else { continue }
            foodConflicts.append(FoodPackageFoodConflict(
                ref: conflict.ref,
                reason: conflict.reason.rawValue,
                incoming: incoming(food),
                existing: FoodPackageExistingFood(
                    id: row.id,
                    name: row.name,
                    brand: row.brand,
                    servingSize: row.servingSize,
                    servingUnit: row.servingUnit.rawValue,
                    calories: Self.round1(row.calories),
                    protein: Self.round1(row.protein),
                    carbs: Self.round1(row.carbs),
                    fat: Self.round1(row.fat),
                    fiber: Self.round1(row.fiber),
                    barcode: row.barcode,
                    labels: row.labels ?? [],
                    imageUrl: row.imageUrl,
                    entryCount: stats[row.id]?.entryCount ?? 0,
                    recipeCount: stats[row.id]?.recipeCount ?? 0
                ),
                alsoMatches: conflict.alsoMatches.compactMap { existingFoods[$0] }.map {
                    FoodPackageAlsoMatch(id: $0.id, name: $0.name, brand: $0.brand)
                },
                allowed: conflict.allowed,
                notes: conflict.notes.map(\.rawValue),
                targetGroup: conflict.targetGroup
            ))
        }

        func ingredientNames(_ recipe: Recipe) -> [String] {
            (recipe.ingredients ?? []).sorted { $0.sortOrder < $1.sortOrder }.compactMap {
                existingFoods[$0.foodId]?.name ?? $0.food?.name
            }
        }
        var recipeConflicts: [FoodPackageRecipeConflict] = []
        for conflict in match.recipeConflicts {
            guard let recipe = recipesByRef[conflict.ref], let row = existingRecipes[conflict.existingId] else {
                continue
            }
            recipeConflicts.append(FoodPackageRecipeConflict(
                ref: conflict.ref,
                incoming: FoodPackageRecipeSummary(
                    name: recipe.name,
                    totalServings: recipe.totalServings,
                    cookedWeight: recipe.cookedWeight,
                    ingredients: recipe.ingredients.compactMap { foodsByRef[$0.food]?.name },
                    imageUrl: recipe.image.flatMap { thumbnails[$0] }
                ),
                existing: FoodPackageExistingRecipe(
                    id: row.id,
                    name: row.name,
                    totalServings: row.totalServings,
                    cookedWeight: row.cookedWeight,
                    ingredients: ingredientNames(row),
                    imageUrl: row.imageUrl,
                    entryCount: recipeEntryCounts[row.id] ?? 0
                ),
                allowed: conflict.allowed,
                notes: conflict.notes.map(\.rawValue)
            ))
        }

        var recipesByFood: [String: [FoodPackageNewFoodRecipe]] = [:]
        for recipe in manifest.recipes where !match.invalidRecipeRefs.contains(recipe.ref) {
            var seen = Set<String>()
            for ingredient in recipe.ingredients where seen.insert(ingredient.food).inserted {
                recipesByFood[ingredient.food, default: []].append(
                    FoodPackageNewFoodRecipe(ref: recipe.ref, name: recipe.name)
                )
            }
        }
        let newFoods = match.newFoodRefs.compactMap { foodsByRef[$0] }
        // An ingredient-only food no importable recipe uses is never created.
        let items = newFoods
            .filter { $0.role == .selected || recipesByFood[$0.ref] != nil }
            .map { food in
                FoodPackageNewFoodItem(
                    ref: food.ref,
                    role: food.role.rawValue,
                    name: food.name,
                    brand: food.brand,
                    servingSize: food.servingSize,
                    servingUnit: food.servingUnit.rawValue,
                    calories: Self.round1(food.calories),
                    recipes: recipesByFood[food.ref] ?? []
                )
            }
        let selectedNew = newFoods.filter { $0.role == .selected }
        let photos = manifest.foods.filter { $0.image != nil }.count + manifest.recipes.filter { $0.image != nil }.count

        return FoodPackagePreview(
            packageHash: file.packageHash,
            totals: .init(foods: manifest.foods.count, recipes: manifest.recipes.count, images: photos),
            newFoods: .init(
                count: newFoods.count, ingredientOnly: newFoods.count - selectedNew.count, items: items
            ),
            newRecipes: .init(count: match.newRecipeRefs.count),
            conflicts: .init(foods: foodConflicts, recipes: recipeConflicts),
            issues: match.issues.prefix(FoodPackageFormat.maxIssues).map {
                FoodPackageIssue(ref: $0.ref, message: $0.message)
            }
        )
    }

    // MARK: - Import

    /// Applies a package with the user's conflict choices, all-or-nothing. The plan is
    /// re-derived from the store rather than trusted from the preview: if anything a
    /// choice was made against changed, nothing is written (`stalePreview`).
    @discardableResult
    func importPackage(_ data: Data, resolutions: FoodPackageResolutions) throws -> FoodPackageImportResult {
        let file = try FoodPackageReader.read(data)
        guard resolutions.packageHash == file.packageHash else { throw FoodPackageError.packageChanged }

        let store = snapshot()
        let match = FoodPackageMatcher.match(
            manifest: file.manifest, existingFoods: store.existingFoods, existingRecipes: store.existingRecipes
        )
        let operations = try FoodPackageMatcher.resolve(
            manifest: file.manifest, match: match, resolutions: resolutions, existingFoods: store.existingFoods
        )
        var issues = match.issues + operations.issues

        // Photos first: they are files, so a failure below has to take them back out.
        var jobs: [(path: String, name: String, ref: String)] = []
        for (_, op) in operations.orderedFoods {
            switch op {
            case .skip: continue
            case let .insert(food, _, _), let .replace(food, _, _):
                if let path = food.image { jobs.append((path, food.name, food.ref)) }
            }
        }
        for (_, op) in operations.orderedRecipes {
            switch op {
            case .skip: continue
            case let .insert(recipe, _), let .replace(recipe, _):
                if let path = recipe.image { jobs.append((path, recipe.name, recipe.ref)) }
            }
        }
        let imageBytes = file.readImages(jobs.map(\.path))
        var imageByRef: [String: String] = [:]
        var written: [String] = []
        for job in jobs {
            guard let bytes = imageBytes[job.path] else {
                issues.append(PackageIssue(ref: job.ref, message: "\"\(job.name)\": image missing from the package"))
                continue
            }
            guard let image = PackageImageCodec.importable(bytes),
                  let url = images.save(image.data, fileExtension: image.ext)
            else {
                issues.append(PackageIssue(ref: job.ref, message: "\"\(job.name)\": image could not be read"))
                continue
            }
            written.append(url)
            imageByRef[job.ref] = url
        }

        var counts = Tallies()
        var superseded: [String] = []
        do {
            try apply(
                operations, snapshot: store, imageByRef: imageByRef, counts: &counts, superseded: &superseded
            )
            try context.save()
        } catch {
            context.rollback()
            for url in written { images.remove(url) }
            throw error
        }
        for url in superseded where !written.contains(url) { images.remove(url) }
        WidgetSnapshotWriter.scheduleUpdate(context: context)

        return FoodPackageImportResult(
            created: FoodPackageCounts(foods: counts.created.foods, recipes: counts.created.recipes),
            replaced: FoodPackageCounts(foods: counts.replaced.foods, recipes: counts.replaced.recipes),
            keptBoth: FoodPackageCounts(foods: counts.keptBoth.foods, recipes: counts.keptBoth.recipes),
            skipped: FoodPackageCounts(foods: counts.skipped.foods, recipes: counts.skipped.recipes),
            images: written.count,
            issues: issues.prefix(FoodPackageFormat.maxIssues).map { FoodPackageIssue(ref: $0.ref, message: $0.message) }
        )
    }

    private struct Tally {
        var foods = 0
        var recipes = 0
    }

    private struct Tallies {
        var created = Tally()
        var replaced = Tally()
        var keptBoth = Tally()
        var skipped = Tally()
    }

    private func apply(
        _ operations: ResolvedOperations,
        snapshot: Snapshot,
        imageByRef: [String: String],
        counts: inout Tallies,
        superseded: inout [String]
    ) throws {
        let stamp = DateFormatting.isoDateTimeString(from: now())
        var foodsById = snapshot.foodsById
        let recipesById = snapshot.recipesById
        var foodIdByRef: [String: String] = [:]
        var replacedFoodIds = Set<String>()

        for (_, op) in operations.orderedFoods {
            switch op {
            case let .skip(food, id):
                foodIdByRef[food.ref] = id
                counts.skipped.foods += 1
            case let .insert(food, barcode, keptBoth):
                let id = LocalStore.makeTempId()
                let created = try Self.makeFood(
                    from: food, id: id, barcode: barcode,
                    imageUrl: imageByRef[food.ref] ?? Self.publicImageUrl(food.imageUrl), stamp: stamp
                )
                context.insert(LocalFood(food: created))
                foodsById[id] = created
                foodIdByRef[food.ref] = id
                if keptBoth { counts.keptBoth.foods += 1 } else { counts.created.foods += 1 }
            case let .replace(food, barcode, id):
                guard let current = foodsById[id], let row = foodRow(id: id) else {
                    throw FoodPackageError.stalePreview
                }
                let image = imageByRef[food.ref] ?? Self.publicImageUrl(food.imageUrl)
                let updated = try Self.replacedFood(current, with: food, barcode: barcode, imageUrl: image, stamp: stamp)
                row.update(from: updated)
                if let image, let old = current.imageUrl, old != image { superseded.append(old) }
                foodsById[id] = updated
                foodIdByRef[food.ref] = id
                replacedFoodIds.insert(id)
                counts.replaced.foods += 1
            }
        }

        var rebuiltRecipeIds = Set<String>()
        for (_, op) in operations.orderedRecipes {
            switch op {
            case .skip:
                counts.skipped.recipes += 1
            case let .insert(recipe, keptBoth):
                let id = LocalStore.makeTempId()
                let built = Self.makeRecipe(
                    recipe, id: id, base: nil, imageUrl: imageByRef[recipe.ref],
                    foodIdByRef: foodIdByRef, foodsById: foodsById, stamp: stamp
                )
                context.insert(LocalRecipe(recipe: built))
                rebuiltRecipeIds.insert(id)
                if keptBoth { counts.keptBoth.recipes += 1 } else { counts.created.recipes += 1 }
            case let .replace(recipe, id):
                guard let current = recipesById[id], let row = recipeRow(id: id) else {
                    throw FoodPackageError.stalePreview
                }
                let image = imageByRef[recipe.ref]
                let built = Self.makeRecipe(
                    recipe, id: id, base: current, imageUrl: image ?? current.imageUrl,
                    foodIdByRef: foodIdByRef, foodsById: foodsById, stamp: stamp
                )
                row.update(from: built)
                if let image, let old = current.imageUrl, old != image { superseded.append(old) }
                rebuiltRecipeIds.insert(id)
                counts.replaced.recipes += 1
            }
        }

        // Recipes the package did not touch still embed the food they used and
        // total their macros from it; a replaced food changes both.
        guard !replacedFoodIds.isEmpty else { return }
        for recipe in snapshot.recipes where !rebuiltRecipeIds.contains(recipe.id) {
            let ingredients = recipe.ingredients ?? []
            guard ingredients.contains(where: { replacedFoodIds.contains($0.foodId) }),
                  let row = recipeRow(id: recipe.id) else { continue }
            let refreshed = ingredients.map { ingredient in
                RecipeIngredient(
                    id: ingredient.id, recipeId: ingredient.recipeId, foodId: ingredient.foodId,
                    quantity: ingredient.quantity, servingUnit: ingredient.servingUnit,
                    sortOrder: ingredient.sortOrder,
                    food: replacedFoodIds.contains(ingredient.foodId) ? foodsById[ingredient.foodId] : ingredient.food
                )
            }
            row.update(from: Self.recipe(recipe, replacing: refreshed))
        }
    }

    // MARK: - Row building

    private static func foodValues(_ food: PackageFood) -> [String: Any] {
        var values: [String: Any] = [
            "name": food.name,
            "servingSize": food.servingSize,
            "servingUnit": food.servingUnit.rawValue,
            "calories": food.calories,
            "protein": food.protein,
            "carbs": food.carbs,
            "fat": food.fat,
            "fiber": food.fiber,
        ]
        let brand = food.brand.map(FoodPackageText.trimmed).flatMap { $0.isEmpty ? nil : $0 }
        values["brand"] = brand.map { $0 as Any } ?? NSNull()
        for key in FoodPackageFormat.nutrientKeys {
            values[key] = food.nutrients[key].map { $0 as Any } ?? NSNull()
        }
        values["nutriScore"] = food.nutriScore.map { $0 as Any } ?? NSNull()
        values["novaGroup"] = food.novaGroup.map { $0 as Any } ?? NSNull()
        values["additives"] = food.additives.map { $0 as Any } ?? NSNull()
        values["ingredientsText"] = food.ingredientsText.map { $0 as Any } ?? NSNull()
        return values
    }

    private static func makeFood(
        from food: PackageFood, id: String, barcode: String?, imageUrl: String?, stamp: String
    ) throws -> Food {
        var values = foodValues(food)
        values["id"] = id
        values["userId"] = ""
        values["isFavorite"] = false
        values["barcode"] = barcode.map { $0 as Any } ?? NSNull()
        values["imageUrl"] = imageUrl.map { $0 as Any } ?? NSNull()
        values["labels"] = LabelNormalizer.normalizeAll(food.labels).sorted()
        values["createdAt"] = stamp
        values["updatedAt"] = stamp
        return try JSONPatch.decode(Food.self, from: values)
    }

    /// The incoming food's data over the existing row: identity, favorite flag and
    /// creation time stay, a barcode is only replaced by another one, a photo only
    /// by another photo, and labels are added next to the existing ones.
    private static func replacedFood(
        _ current: Food, with food: PackageFood, barcode: String?, imageUrl: String?, stamp: String
    ) throws -> Food {
        var patch = foodValues(food)
        if let barcode { patch["barcode"] = barcode }
        if let imageUrl { patch["imageUrl"] = imageUrl }
        let existing = current.labels ?? []
        let room = max(0, FoodPackageFormat.maxLabelsPerFood - existing.count)
        let additions = LabelNormalizer.normalizeAll(food.labels).prefix(room).filter { !existing.contains($0) }
        patch["labels"] = (existing + additions).sorted()
        patch["updatedAt"] = stamp
        return try JSONPatch.merged(Food.self, base: current, patch: patch)
    }

    private static func makeRecipe(
        _ recipe: PackageRecipe,
        id: String,
        base: Recipe?,
        imageUrl: String?,
        foodIdByRef: [String: String],
        foodsById: [String: Food],
        stamp: String
    ) -> Recipe {
        let ingredients = recipe.ingredients.enumerated().compactMap { index, ingredient -> RecipeIngredient? in
            guard let foodId = foodIdByRef[ingredient.food] else { return nil }
            return RecipeIngredient(
                id: nil, recipeId: id, foodId: foodId, quantity: ingredient.quantity,
                servingUnit: ingredient.servingUnit, sortOrder: index, food: foodsById[foodId]
            )
        }
        let macros = RecipeRepository.recipeMacros(of: ingredients)
        var built = Recipe(
            id: id,
            userId: base?.userId ?? "",
            name: recipe.name,
            totalServings: recipe.totalServings,
            isFavorite: base?.isFavorite ?? false,
            imageUrl: imageUrl,
            calories: macros.calories,
            protein: macros.protein,
            carbs: macros.carbs,
            fat: macros.fat,
            fiber: macros.fiber,
            cookedWeight: recipe.cookedWeight,
            createdAt: base?.createdAt ?? stamp,
            updatedAt: stamp,
            ingredients: ingredients
        )
        built.steps = base?.steps
        built.stepCount = base?.stepCount
        return built
    }

    private static func recipe(_ recipe: Recipe, replacing ingredients: [RecipeIngredient]) -> Recipe {
        RecipeRepository.applying(ingredients: ingredients, to: recipe)
    }

    // MARK: - Store helpers

    private func foodRow(id: String) -> LocalFood? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func recipeRow(id: String) -> LocalRecipe? {
        var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }
}
