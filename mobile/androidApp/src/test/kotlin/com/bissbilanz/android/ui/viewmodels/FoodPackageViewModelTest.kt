package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.FoodPackageEvents
import com.bissbilanz.android.navigation.PendingPackageImport
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.FoodPackageDownload
import com.bissbilanz.api.generated.model.FoodPackageConflicts
import com.bissbilanz.api.generated.model.FoodPackageCounts
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import com.bissbilanz.api.generated.model.FoodPackageImportResult
import com.bissbilanz.api.generated.model.FoodPackageNewFoodItem
import com.bissbilanz.api.generated.model.FoodPackageNewFoods
import com.bissbilanz.api.generated.model.FoodPackageNewRecipes
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageResolutions
import com.bissbilanz.api.generated.model.FoodPackageSelection
import com.bissbilanz.api.generated.model.FoodPackageTotals
import com.bissbilanz.foodpackage.ExportedPackage
import com.bissbilanz.foodpackage.FoodPackageArchive
import com.bissbilanz.foodpackage.FoodPackageException
import com.bissbilanz.foodpackage.LocalFoodPackageService
import com.bissbilanz.foodpackage.MappedFood
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.storage.KeyValueStore
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Local mode runs the whole package flow on the device; with an account the server does. Either
 * way the screens see the same preview and result types, so these check that the view model picks
 * the right engine, sends the user's mappings, and never uploads a file it could not read.
 *
 * The view model does its file work on the IO dispatcher, so the tests wait on its state flows
 * (in real time) rather than on virtual time.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FoodPackageViewModelTest {
    private lateinit var api: BissbilanzApi
    private lateinit var refreshManager: RefreshManager
    private lateinit var local: LocalFoodPackageService
    private lateinit var archive: FoodPackageArchive
    private lateinit var foodRepo: FoodRepository
    private lateinit var pkg: File

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        api = mockk(relaxed = true)
        refreshManager = mockk(relaxed = true)
        local = mockk(relaxed = true)
        archive = mockk(relaxed = true)
        foodRepo = mockk(relaxed = true) { every { allFoods() } returns flowOf(emptyList()) }
        pkg = File.createTempFile("package", ".pkg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
        pkg.delete()
    }

    private fun viewModel(mode: AppMode): FoodPackageViewModel {
        val modeManager = AppModeManager(mockk<KeyValueStore>(relaxed = true))
        modeManager.setMode(mode)
        return FoodPackageViewModel(api, refreshManager, mockk<ErrorReporter>(relaxed = true), modeManager, local, archive, foodRepo)
    }

    private suspend fun <T> awaitState(
        flow: StateFlow<T>,
        predicate: (T) -> Boolean,
    ): T = withTimeout(10_000) { flow.first(predicate) }

    private fun item(ref: String) =
        FoodPackageNewFoodItem(
            ref,
            FoodPackageFoodRole.ingredient,
            "Honig",
            null,
            20.0,
            FoodPackageNewFoodItem.ServingUnit.g,
            61.0,
            emptyList(),
        )

    private fun preview(hash: String = "h".repeat(64)) =
        FoodPackagePreviewResponse(
            packageHash = hash,
            formatVersion = 1,
            exportedAt = null,
            totals = FoodPackageTotals(1, 0, 0),
            newFoods = FoodPackageNewFoods(1, 1, emptyList(), listOf(item("f1"))),
            newRecipes = FoodPackageNewRecipes(0, emptyList()),
            conflicts = FoodPackageConflicts(emptyList(), emptyList()),
            issues = emptyList(),
        )

    private val result =
        FoodPackageImportResult(
            created = FoodPackageCounts(1, 0),
            replaced = FoodPackageCounts(0, 0),
            keptBoth = FoodPackageCounts(0, 0),
            skipped = FoodPackageCounts(0, 0),
            images = 0,
            issues = emptyList(),
        )

    private fun mine() = MappedFood("temp_9", "Blütenhonig", null, 100.0, "g")

    private suspend fun FoodPackageViewModel.analyzed(fileName: String = "a.bissbilanz") {
        analyze(fileName, pkg.path)
        awaitState(importState) { !it.analyzing }
    }

    @Test
    fun localModePreviewsAndImportsOnTheDeviceAndSendsTheMappings() =
        runBlocking<Unit> {
            coEvery { local.preview(pkg.path) } returns preview()
            val sent = slot<FoodPackageResolutions>()
            coEvery { local.commit(pkg.path, capture(sent)) } returns result
            val imported = mutableListOf<Unit>()
            // Subscribed before anything can emit: a shared flow without replay drops what nobody is listening to.
            val listener = launch(start = CoroutineStart.UNDISPATCHED) { FoodPackageEvents.imported.collect { imported.add(it) } }
            val vm = viewModel(AppMode.LOCAL)

            vm.analyzed("Lasagne.bissbilanz")
            assertNotNull(vm.importState.value.preview)
            vm.mapFood("f1", mine())
            vm.commit()
            awaitState(vm.importState) { it.result != null }

            assertEquals(result, vm.importState.value.result)
            assertEquals(listOf("f1" to "temp_9"), sent.captured.mappings?.map { it.ref to it.foodId })
            coVerify(exactly = 0) { api.previewFoodPackage(any(), any()) }
            coVerify(exactly = 0) { api.importFoodPackage(any(), any(), any()) }
            coVerify(exactly = 0) { refreshManager.refreshAll(any()) }
            // Lists that are already loaded reload.
            withTimeout(5_000) { while (imported.isEmpty()) kotlinx.coroutines.yield() }
            listener.cancel()
        }

    @Test
    fun aNewerPackageSupersedesAPreviewStillRunning() =
        runBlocking<Unit> {
            val second = File.createTempFile("package2", ".pkg").apply { writeBytes(byteArrayOf(4, 5, 6)) }
            coEvery { local.preview(pkg.path) } coAnswers {
                kotlinx.coroutines.delay(300)
                preview("1".repeat(64))
            }
            coEvery { local.preview(second.path) } returns preview("2".repeat(64))
            val vm = viewModel(AppMode.LOCAL)

            vm.analyze("a.bissbilanz", pkg.path)
            vm.analyze("b.bissbilanz", second.path)
            awaitState(vm.importState) { !it.analyzing && it.preview != null }
            // Outlast the slow first preview: its late result must not replace the second.
            kotlinx.coroutines.delay(600)

            assertEquals(
                "2".repeat(64),
                vm.importState.value.preview
                    ?.packageHash,
            )
            assertEquals("b.bissbilanz", vm.importState.value.fileName)
            second.delete()
        }

    @Test
    fun undoingAMappingSendsNone() =
        runBlocking<Unit> {
            coEvery { local.preview(pkg.path) } returns preview()
            val sent = slot<FoodPackageResolutions>()
            coEvery { local.commit(pkg.path, capture(sent)) } returns result
            val vm = viewModel(AppMode.LOCAL)

            vm.analyzed()
            vm.mapFood("f1", mine())
            vm.unmapFood("f1")
            vm.commit()
            awaitState(vm.importState) { it.result != null }

            assertTrue(
                sent.captured.mappings
                    .orEmpty()
                    .isEmpty(),
            )
        }

    @Test
    fun aStalePreviewIsReviewedAgain() =
        runBlocking<Unit> {
            val first = preview("1".repeat(64))
            val second = preview("2".repeat(64))
            coEvery { local.preview(pkg.path) } returnsMany listOf(first, second)
            coEvery { local.commit(any(), any()) } throws FoodPackageException(FoodPackageException.Kind.STALE_PREVIEW, "stale_preview")
            val vm = viewModel(AppMode.LOCAL)

            vm.analyzed()
            assertEquals(first, vm.importState.value.preview)
            vm.mapFood("f1", mine())
            vm.commit()
            // The data changed since the preview, so the user reviews a fresh one.
            awaitState(vm.importState) { it.preview == second && !it.analyzing && !it.importing }

            assertEquals(R.string.food_package_stale, vm.messageRes.value)
            assertNull(vm.importState.value.result)
            coVerify(exactly = 2) { local.preview(pkg.path) }
            // The old mapping went with the old preview.
            assertTrue(
                vm.importState.value.mappings
                    .isEmpty(),
            )
        }

    @Test
    fun aSyncedAccountSendsTheFileAndTheMappingsToTheServer() =
        runBlocking<Unit> {
            coEvery { api.previewFoodPackage("a.bissbilanz", any()) } returns preview()
            val sent = slot<FoodPackageResolutions>()
            coEvery { api.importFoodPackage("a.bissbilanz", any(), capture(sent)) } returns result
            val vm = viewModel(AppMode.SYNCED)

            vm.analyzed()
            vm.mapFood("f1", mine())
            vm.commit()
            awaitState(vm.importState) { it.result != null }

            assertEquals(listOf("f1" to "temp_9"), sent.captured.mappings?.map { it.ref to it.foodId })
            coVerify(exactly = 0) { local.preview(any()) }
            coVerify { refreshManager.refreshAll(any()) }
        }

    @Test
    fun aFileThatIsNotAPackageNeverReachesTheServer() =
        runBlocking<Unit> {
            every { archive.read(pkg.path) } throws FoodPackageException(FoodPackageException.Kind.NOT_A_PACKAGE, "nope")
            val vm = viewModel(AppMode.SYNCED)

            vm.analyzed("photo.zip")

            assertEquals(R.string.food_package_error_not_a_package, vm.importState.value.errorRes)
            assertNull(vm.importState.value.preview)
            coVerify(exactly = 0) { api.previewFoodPackage(any(), any()) }
        }

    @Test
    fun explainsWhyAFileCouldNotBeOpened() =
        runBlocking<Unit> {
            coEvery { local.preview(pkg.path) } throws FoodPackageException(FoodPackageException.Kind.ACCOUNT_EXPORT, "x")
            val vm = viewModel(AppMode.LOCAL)

            vm.analyzed("bissbilanz.zip")
            assertEquals(R.string.food_package_error_account_export, vm.importState.value.errorRes)

            vm.openIncoming(PendingPackageImport.Request("big.bissbilanz", null, PendingPackageImport.Problem.TOO_LARGE))
            assertEquals(R.string.food_package_file_too_large, vm.importState.value.errorRes)

            vm.openIncoming(PendingPackageImport.Request("gone.bissbilanz", null, PendingPackageImport.Problem.UNREADABLE))
            assertEquals(R.string.food_package_error_unreadable, vm.importState.value.errorRes)
            assertEquals("gone.bissbilanz", vm.importState.value.fileName)
        }

    @Test
    fun anIncomingFileIsAnalyzedLikeAPickedOne() =
        runBlocking<Unit> {
            coEvery { local.preview(pkg.path) } returns preview()
            val vm = viewModel(AppMode.LOCAL)

            vm.openIncoming(PendingPackageImport.Request("Lasagne.bissbilanz", pkg.path))
            awaitState(vm.importState) { it.preview != null }

            assertEquals("Lasagne.bissbilanz", vm.importState.value.fileName)
        }

    @Test
    fun localExportWritesTheFileUnderItsShareName() =
        runBlocking<Unit> {
            val selection = slot<FoodPackageSelection>()
            coEvery { local.summarize(any()) } returns mockk(relaxed = true)
            coEvery { local.export(capture(selection), any()) } returns ExportedPackage(byteArrayOf(5, 6), "Lasagne.bissbilanz", 0, 1)
            val cache = createTempDirectory().toFile()
            val vm = viewModel(AppMode.LOCAL)

            vm.startExport(recipeIds = listOf("temp_r1"), recipesOnly = true)
            vm.exportPackage(cache)
            val file = awaitState(vm.exportedFile) { it != null }

            assertEquals("Lasagne.bissbilanz", file?.name)
            assertEquals(listOf<Byte>(5, 6), file?.readBytes()?.toList())
            assertEquals(listOf("temp_r1"), selection.captured.recipeIds)
            coVerify(exactly = 0) { api.exportFoodPackage(any()) }
            cache.deleteRecursively()
        }

    @Test
    fun aSyncedExportKeepsTheNameTheServerChose() =
        runBlocking<Unit> {
            coEvery { api.summarizeFoodPackage(any()) } returns mockk(relaxed = true)
            coEvery { api.exportFoodPackage(any()) } returns FoodPackageDownload(byteArrayOf(7), "Käsespätzle.bissbilanz")
            val cache = createTempDirectory().toFile()
            val vm = viewModel(AppMode.SYNCED)

            vm.startExport()
            vm.exportPackage(cache)
            val file = awaitState(vm.exportedFile) { it != null }

            assertEquals("Käsespätzle.bissbilanz", file?.name)
            coVerify(exactly = 0) { local.export(any(), any()) }
            cache.deleteRecursively()
        }
}
