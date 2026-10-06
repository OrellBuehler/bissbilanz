package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.bulk.BulkImportScheduler
import com.bissbilanz.android.bulk.BulkImportStatus
import com.bissbilanz.android.bulk.BulkImportWorker
import com.bissbilanz.android.navigation.FoodPackageEvents
import com.bissbilanz.android.navigation.IncomingPackageFiles
import com.bissbilanz.android.navigation.PendingPackageImport
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.FoodBrandStat
import com.bissbilanz.api.generated.model.FoodLabelStat
import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageImportResult
import com.bissbilanz.api.generated.model.FoodPackageIncludeRecipes
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageSelection
import com.bissbilanz.api.generated.model.FoodPackageSummaryResponse
import com.bissbilanz.foodpackage.BulkManifestInfo
import com.bissbilanz.foodpackage.BulkPackageImporter
import com.bissbilanz.foodpackage.FoodPackageArchive
import com.bissbilanz.foodpackage.FoodPackageException
import com.bissbilanz.foodpackage.FoodPackageMappingState
import com.bissbilanz.foodpackage.FoodPackageResolutionState
import com.bissbilanz.foodpackage.LocalFoodPackageService
import com.bissbilanz.foodpackage.MAX_PACKAGE_BYTES
import com.bissbilanz.foodpackage.MAX_PACKAGE_FOODS
import com.bissbilanz.foodpackage.MappedFood
import com.bissbilanz.foodpackage.resolvable
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Export and import of shareable food packages, mirroring the web's FoodPackageExportDialog /
 * FoodPackageImportDialog. With an account the server builds and reads the packages
 * (`/api/foods/package/...`); in Local mode [LocalFoodPackageService] does the same on the device,
 * in the very same format and producing the very same preview and result types, so the screens
 * cannot tell the two apart and a package made by either opens in the other.
 */
class FoodPackageViewModel(
    private val api: BissbilanzApi,
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
    private val localPackages: LocalFoodPackageService,
    private val archive: FoodPackageArchive,
    private val foodRepository: FoodRepository,
    private val bulkImporter: BulkPackageImporter,
    private val bulkImports: BulkImportScheduler,
) : ViewModel() {
    private val isLocalMode: Boolean get() = appModeManager.isLocal

    enum class ExportMode { ALL, FILTER, SELECTED }

    data class ExportState(
        val mode: ExportMode = ExportMode.ALL,
        val foodIds: List<String> = emptyList(),
        val recipeIds: List<String> = emptyList(),
        val recipesOnly: Boolean = false,
        val includeRecipes: Boolean = true,
        val brands: Set<String> = emptySet(),
        val labels: Set<String> = emptySet(),
        val brandOptions: List<FoodBrandStat> = emptyList(),
        val labelOptions: List<FoodLabelStat> = emptyList(),
        val summary: FoodPackageSummaryResponse? = null,
        val loadingSummary: Boolean = false,
        val exporting: Boolean = false,
    ) {
        val hasSelection get() = foodIds.isNotEmpty() || recipeIds.isNotEmpty()

        fun selection(): FoodPackageSelection? =
            when (mode) {
                ExportMode.ALL ->
                    if (recipesOnly) {
                        FoodPackageSelection(includeRecipes = FoodPackageIncludeRecipes.all)
                    } else {
                        FoodPackageSelection(
                            all = true,
                            includeRecipes = if (includeRecipes) FoodPackageIncludeRecipes.all else FoodPackageIncludeRecipes.none,
                        )
                    }
                ExportMode.SELECTED ->
                    FoodPackageSelection(
                        foodIds = foodIds.ifEmpty { null },
                        recipeIds = recipeIds.ifEmpty { null },
                        includeRecipes =
                            if (includeRecipes && foodIds.isNotEmpty()) {
                                FoodPackageIncludeRecipes.related
                            } else {
                                FoodPackageIncludeRecipes.none
                            },
                    )
                ExportMode.FILTER ->
                    if (brands.isEmpty() && labels.isEmpty()) {
                        null
                    } else {
                        FoodPackageSelection(
                            brands = brands.toList().ifEmpty { null },
                            labels = labels.toList().ifEmpty { null },
                            includeRecipes = if (includeRecipes) FoodPackageIncludeRecipes.related else FoodPackageIncludeRecipes.none,
                        )
                    }
            }
    }

    private val _exportState = MutableStateFlow(ExportState())
    val exportState: StateFlow<ExportState> = _exportState.asStateFlow()

    private val _exportedFile = MutableStateFlow<File?>(null)
    val exportedFile: StateFlow<File?> = _exportedFile.asStateFlow()

    private val _messageRes = MutableStateFlow<Int?>(null)
    val messageRes: StateFlow<Int?> = _messageRes.asStateFlow()

    private var summaryJob: Job? = null
    private var facetsLoaded = false

    fun startExport(
        foodIds: List<String> = emptyList(),
        recipeIds: List<String> = emptyList(),
        recipesOnly: Boolean = false,
    ) {
        val selection = foodIds.isNotEmpty() || recipeIds.isNotEmpty()
        _exportState.value =
            ExportState(
                mode = if (selection) ExportMode.SELECTED else ExportMode.ALL,
                foodIds = foodIds,
                recipeIds = recipeIds,
                recipesOnly = recipesOnly,
                includeRecipes = !selection || recipesOnly,
                brandOptions = _exportState.value.brandOptions,
                labelOptions = _exportState.value.labelOptions,
            )
        // The brand and label lists follow the food list, which may have changed since last time.
        facetsLoaded = false
        refreshSummary()
    }

    fun setMode(mode: ExportMode) {
        _exportState.update { it.copy(mode = mode) }
        if (mode == ExportMode.FILTER) loadFacets()
        refreshSummary()
    }

    fun setIncludeRecipes(include: Boolean) {
        _exportState.update { it.copy(includeRecipes = include) }
        refreshSummary()
    }

    fun toggleBrand(brand: String) {
        _exportState.update { it.copy(brands = if (brand in it.brands) it.brands - brand else it.brands + brand) }
        refreshSummary()
    }

    fun toggleLabel(label: String) {
        _exportState.update { it.copy(labels = if (label in it.labels) it.labels - label else it.labels + label) }
        refreshSummary()
    }

    private fun loadFacets() {
        if (facetsLoaded) return
        facetsLoaded = true
        viewModelScope.launch {
            try {
                if (isLocalMode) {
                    val brands = foodRepository.localBrandStats()
                    val labels = foodRepository.localLabelStats()
                    _exportState.update { it.copy(brandOptions = brands, labelOptions = labels) }
                } else {
                    val brands = api.getFoodBrands()
                    val labels = api.getFoodLabelStats("food")
                    _exportState.update { it.copy(brandOptions = brands, labelOptions = labels) }
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                facetsLoaded = false
                errorReporter.captureException(e)
            }
        }
    }

    private fun refreshSummary() {
        summaryJob?.cancel()
        val selection = _exportState.value.selection()
        if (selection == null) {
            _exportState.update { it.copy(summary = null, loadingSummary = false) }
            return
        }
        summaryJob =
            viewModelScope.launch {
                _exportState.update { it.copy(loadingSummary = true) }
                delay(300)
                try {
                    val summary = if (isLocalMode) localPackages.summarize(selection) else api.summarizeFoodPackage(selection)
                    _exportState.update { it.copy(summary = summary) }
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    if (e !is FoodPackageException) errorReporter.captureException(e)
                    _exportState.update { it.copy(summary = null) }
                }
                _exportState.update { it.copy(loadingSummary = false) }
            }
    }

    fun exportPackage(cacheDir: File) {
        val selection = _exportState.value.selection() ?: return
        if (_exportState.value.exporting) return
        viewModelScope.launch {
            _exportState.update { it.copy(exporting = true) }
            try {
                val (bytes, fileName) =
                    if (isLocalMode) {
                        localPackages.export(selection).let { it.bytes to it.fileName }
                    } else {
                        api.exportFoodPackage(selection).let { it.bytes to it.fileName }
                    }
                _exportedFile.value =
                    withContext(Dispatchers.IO) {
                        val dir = File(cacheDir, "exports").apply { mkdirs() }
                        // The name is what the receiver sees in the chat or the mail, so it is kept.
                        File(dir, fileName).apply { writeBytes(bytes) }
                    }
            } catch (e: FoodPackageException) {
                _messageRes.value = exportMessage(e)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _messageRes.value = R.string.food_package_export_failed
            }
            _exportState.update { it.copy(exporting = false) }
        }
    }

    private fun exportMessage(e: FoodPackageException): Int =
        when (e.kind) {
            FoodPackageException.Kind.TOO_LARGE -> R.string.food_package_too_large
            FoodPackageException.Kind.NOTHING_TO_EXPORT -> R.string.food_package_nothing_selected
            else -> R.string.food_package_export_failed
        }

    fun clearExportedFile() {
        _exportedFile.value = null
    }

    // ── Import ────────────────────────────────────────────────────────────

    data class ImportState(
        val fileName: String? = null,
        /** The package, copied into the app cache: read again for the preview and the commit. */
        val path: String? = null,
        val analyzing: Boolean = false,
        val importing: Boolean = false,
        val preview: FoodPackagePreviewResponse? = null,
        val foods: Map<String, FoodPackageAction> = emptyMap(),
        val recipes: Map<String, FoodPackageAction> = emptyMap(),
        /** New incoming foods that stand in for one of the user's own, by package ref. */
        val mappings: Map<String, MappedFood> = emptyMap(),
        val result: FoodPackageImportResult? = null,
        /** Set instead of [preview] for a package too big for the per-item review: it is imported as a whole. */
        val bulk: BulkManifestInfo? = null,
        /** Server error text (e.g. a rejected file), shown verbatim. */
        val error: String? = null,
        /** Why the file could not be opened, as a string resource. */
        val errorRes: Int? = null,
    )

    private val _importState = MutableStateFlow(ImportState())
    val importState: StateFlow<ImportState> = _importState.asStateFlow()

    /** The background import of a huge package, which keeps running when this screen is left. */
    val bulkStatus: StateFlow<BulkImportStatus> =
        bulkImports.status.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), BulkImportStatus.Idle)

    fun resetImport() {
        previewJob?.cancel()
        IncomingPackageFiles.delete(_importState.value.path)
        _importState.value = ImportState()
        if (bulkStatus.value !is BulkImportStatus.Running) bulkImports.acknowledge()
    }

    /**
     * Hands the package to the background import. From here the file belongs to that job: it
     * deletes it when done, so this screen lets go of it.
     */
    fun startBulkImport() {
        val state = _importState.value
        val path = state.path ?: return
        if (state.bulk == null) return
        bulkImports.start(path, state.fileName ?: IncomingPackageFiles.DEFAULT_NAME)
        _importState.update { it.copy(path = null, importing = true) }
    }

    fun bulkErrorRes(kind: String): Int =
        when (kind) {
            BulkImportWorker.KIND_SIGNED_OUT -> R.string.bulk_import_error_signed_out
            BulkImportWorker.KIND_FAILED -> R.string.bulk_import_error_failed
            BulkImportWorker.KIND_UNREADABLE -> R.string.food_package_error_unreadable
            else ->
                FoodPackageException.Kind.entries
                    .firstOrNull { it.name == kind }
                    ?.let { openErrorRes(FoodPackageException(it, kind)) }
                    ?: R.string.bulk_import_error_failed
        }

    /** Take up a file handed over from outside the app (or a problem reading it). */
    fun openIncoming(request: PendingPackageImport.Request) {
        val path = request.path
        if (path == null) {
            IncomingPackageFiles.delete(_importState.value.path)
            _importState.value =
                ImportState(
                    fileName = request.fileName,
                    errorRes =
                        when (request.problem) {
                            PendingPackageImport.Problem.TOO_LARGE -> R.string.food_package_file_too_large
                            PendingPackageImport.Problem.NO_SPACE -> R.string.food_package_error_no_space
                            else -> R.string.food_package_error_unreadable
                        },
                )
            return
        }
        analyze(request.fileName, path)
    }

    fun analyze(
        fileName: String,
        path: String,
    ) {
        val previous = _importState.value.path
        if (previous != null && previous != path) IncomingPackageFiles.delete(previous)
        _importState.value = ImportState(fileName = fileName, path = path, analyzing = true)
        runPreview()
    }

    /** Report a file that could not even be copied (too large, unreadable). */
    fun fileRejected(messageRes: Int) {
        _messageRes.value = messageRes
    }

    private var previewJob: Job? = null

    private fun runPreview() {
        val state = _importState.value
        val path = state.path ?: return
        val fileName = state.fileName ?: IncomingPackageFiles.DEFAULT_NAME
        // A newer package supersedes the one still being analyzed; its late result must not
        // land on the new import.
        previewJob?.cancel()
        _importState.update { it.copy(analyzing = true, error = null, errorRes = null) }
        previewJob =
            viewModelScope.launch {
                try {
                    val info = bulkImporter.peek(path)
                    if (info.foodCount > MAX_PACKAGE_FOODS || File(path).length() > MAX_PACKAGE_BYTES) {
                        _importState.update { it.copy(bulk = info, preview = null) }
                    } else {
                        val preview =
                            withContext(Dispatchers.IO) {
                                // Every file is checked on the device first, so a stray zip gets a clear
                                // message instead of an upload that fails.
                                if (!isLocalMode) archive.read(path)
                                if (isLocalMode) localPackages.preview(path) else api.previewFoodPackage(fileName, File(path).readBytes())
                            }
                        _importState.update {
                            it.copy(
                                preview = preview,
                                foods = FoodPackageResolutionState.initial(preview.conflicts.foods.map { c -> c.resolvable() }),
                                recipes = FoodPackageResolutionState.initial(preview.conflicts.recipes.map { c -> c.resolvable() }),
                                mappings = emptyMap(),
                            )
                        }
                    }
                } catch (e: FoodPackageException) {
                    _importState.update { it.copy(preview = null, errorRes = openErrorRes(e)) }
                } catch (e: ApiException) {
                    errorReporter.captureException(e)
                    _importState.update { it.copy(preview = null, error = serverError(e)) }
                    if (serverError(e) == null) _messageRes.value = R.string.food_package_import_failed
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                    _messageRes.value = R.string.food_package_import_failed
                }
                _importState.update { it.copy(analyzing = false) }
            }
    }

    private fun openErrorRes(e: FoodPackageException): Int =
        when (e.kind) {
            FoodPackageException.Kind.ACCOUNT_EXPORT -> R.string.food_package_error_account_export
            FoodPackageException.Kind.NEWER_VERSION -> R.string.food_package_error_newer_version
            FoodPackageException.Kind.TOO_LARGE -> R.string.food_package_file_too_large
            FoodPackageException.Kind.INVALID,
            FoodPackageException.Kind.DAMAGED,
            FoodPackageException.Kind.TOO_MANY_FILES,
            -> R.string.food_package_error_invalid
            else -> R.string.food_package_error_not_a_package
        }

    fun setFoodAction(
        ref: String,
        action: FoodPackageAction,
    ) {
        val conflicts =
            _importState.value.preview
                ?.conflicts
                ?.foods
                ?.map { it.resolvable() } ?: return
        _importState.update { it.copy(foods = FoodPackageResolutionState.set(it.foods, conflicts, ref, action)) }
    }

    fun setRecipeAction(
        ref: String,
        action: FoodPackageAction,
    ) {
        val conflicts =
            _importState.value.preview
                ?.conflicts
                ?.recipes
                ?.map { it.resolvable() } ?: return
        _importState.update { it.copy(recipes = FoodPackageResolutionState.set(it.recipes, conflicts, ref, action)) }
    }

    fun applyToAllFoods(action: FoodPackageAction) {
        val conflicts =
            _importState.value.preview
                ?.conflicts
                ?.foods
                ?.map { it.resolvable() } ?: return
        _importState.update { it.copy(foods = FoodPackageResolutionState.applyToAll(conflicts, action)) }
    }

    fun applyToAllRecipes(action: FoodPackageAction) {
        val conflicts =
            _importState.value.preview
                ?.conflicts
                ?.recipes
                ?.map { it.resolvable() } ?: return
        _importState.update { it.copy(recipes = FoodPackageResolutionState.applyToAll(conflicts, action)) }
    }

    fun mapFood(
        ref: String,
        food: MappedFood,
    ) {
        _importState.update { it.copy(mappings = FoodPackageMappingState.set(it.mappings, ref, food)) }
    }

    fun unmapFood(ref: String) {
        _importState.update { it.copy(mappings = FoodPackageMappingState.clear(it.mappings, ref)) }
    }

    fun commit() {
        val state = _importState.value
        val preview = state.preview ?: return
        val path = state.path ?: return
        if (state.importing) return
        viewModelScope.launch {
            _importState.update { it.copy(importing = true) }
            try {
                val resolutions = FoodPackageMappingState.toResolutions(preview, state.foods, state.recipes, state.mappings)
                val result =
                    withContext(Dispatchers.IO) {
                        if (isLocalMode) {
                            localPackages.commit(path, resolutions)
                        } else {
                            api.importFoodPackage(state.fileName ?: IncomingPackageFiles.DEFAULT_NAME, File(path).readBytes(), resolutions)
                        }
                    }
                _importState.update { it.copy(result = result) }
                afterImport()
            } catch (e: FoodPackageException) {
                if (e.kind == FoodPackageException.Kind.STALE_PREVIEW) {
                    // The data changed since the preview: review again.
                    _messageRes.value = R.string.food_package_stale
                    runPreview()
                } else {
                    errorReporter.captureException(e)
                    _messageRes.value = R.string.food_package_import_failed
                }
            } catch (e: ApiException) {
                errorReporter.captureException(e)
                if (e.statusCode == 409) {
                    // The account changed since the preview: review again.
                    _messageRes.value = R.string.food_package_stale
                    runPreview()
                } else {
                    _messageRes.value = R.string.food_package_import_failed
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _messageRes.value = R.string.food_package_import_failed
            }
            _importState.update { it.copy(importing = false) }
        }
    }

    private suspend fun afterImport() {
        if (!isLocalMode) refreshManager.refreshAll()
        // Widgets, shortcuts and the watch list follow the food list; the food and recipe lists
        // reload themselves.
        foodRepository.onFoodChanged?.invoke()
        FoodPackageEvents.imported.tryEmit(Unit)
    }

    fun clearMessage() {
        _messageRes.value = null
    }

    override fun onCleared() {
        IncomingPackageFiles.delete(_importState.value.path)
        super.onCleared()
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }

    private fun serverError(e: ApiException): String? {
        if (e.statusCode != 400) return null
        val body = e.responseBody ?: return null
        return Regex("\"error\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
            .find(body)
            ?.groupValues
            ?.get(1)
            ?.takeIf { it != "Validation failed" }
    }
}
