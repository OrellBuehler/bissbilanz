package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
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
import com.bissbilanz.foodpackage.FoodPackageResolutionState
import com.bissbilanz.foodpackage.resolvable
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Export and import of shareable food packages (`/api/foods/package/...`),
 * mirroring the web's FoodPackageExportDialog / FoodPackageImportDialog.
 * Both need the server, so they are unavailable in local mode.
 */
class FoodPackageViewModel(
    private val api: BissbilanzApi,
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
    appModeManager: AppModeManager,
) : ViewModel() {
    val isLocalMode: Boolean = appModeManager.isLocal

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
                val brands = api.getFoodBrands()
                val labels = api.getFoodLabelStats("food")
                _exportState.update { it.copy(brandOptions = brands, labelOptions = labels) }
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
                    val summary = api.summarizeFoodPackage(selection)
                    _exportState.update { it.copy(summary = summary) }
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
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
                val bytes = api.exportFoodPackage(selection)
                _exportedFile.value =
                    withContext(Dispatchers.IO) {
                        val dir = File(cacheDir, "exports").apply { mkdirs() }
                        File(dir, "bissbilanz-foods-${java.time.LocalDate.now()}.zip").apply { writeBytes(bytes) }
                    }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _messageRes.value = R.string.food_package_export_failed
            }
            _exportState.update { it.copy(exporting = false) }
        }
    }

    fun clearExportedFile() {
        _exportedFile.value = null
    }

    // ── Import ────────────────────────────────────────────────────────────

    data class ImportState(
        val fileName: String? = null,
        val bytes: ByteArray? = null,
        val analyzing: Boolean = false,
        val importing: Boolean = false,
        val preview: FoodPackagePreviewResponse? = null,
        val foods: Map<String, FoodPackageAction> = emptyMap(),
        val recipes: Map<String, FoodPackageAction> = emptyMap(),
        val result: FoodPackageImportResult? = null,
        /** Server error text (e.g. "This is a full account export…"), shown verbatim. */
        val error: String? = null,
    )

    private val _importState = MutableStateFlow(ImportState())
    val importState: StateFlow<ImportState> = _importState.asStateFlow()

    fun resetImport() {
        _importState.value = ImportState()
    }

    fun analyze(
        fileName: String,
        bytes: ByteArray,
    ) {
        _importState.value = ImportState(fileName = fileName, bytes = bytes, analyzing = true)
        runPreview()
    }

    private fun runPreview() {
        val state = _importState.value
        val bytes = state.bytes ?: return
        val fileName = state.fileName ?: "package.zip"
        viewModelScope.launch {
            _importState.update { it.copy(analyzing = true, error = null) }
            try {
                val preview = api.previewFoodPackage(fileName, bytes)
                _importState.update {
                    it.copy(
                        preview = preview,
                        foods = FoodPackageResolutionState.initial(preview.conflicts.foods.map { c -> c.resolvable() }),
                        recipes = FoodPackageResolutionState.initial(preview.conflicts.recipes.map { c -> c.resolvable() }),
                    )
                }
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

    fun commit() {
        val state = _importState.value
        val preview = state.preview ?: return
        val bytes = state.bytes ?: return
        if (state.importing) return
        viewModelScope.launch {
            _importState.update { it.copy(importing = true) }
            try {
                val result =
                    api.importFoodPackage(
                        state.fileName ?: "package.zip",
                        bytes,
                        FoodPackageResolutionState.toResolutions(preview, state.foods, state.recipes),
                    )
                _importState.update { it.copy(result = result) }
                refreshManager.refreshAll()
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

    fun clearMessage() {
        _messageRes.value = null
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
