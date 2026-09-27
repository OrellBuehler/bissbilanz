package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTaskUpdate
import com.bissbilanz.api.generated.model.AiTasksResponse
import com.bissbilanz.mode.AppMode
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AiTaskRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var repository: AiTaskRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        repository = AiTaskRepository(api, NoopErrorReporter(), appModeManager())
    }

    @Test
    fun refreshCachesTasksOnSuccess() =
        runTest {
            val tasks = listOf(TestFixtures.aiTask(id = "1"), TestFixtures.aiTask(id = "2"))
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = tasks, total = tasks.size)

            repository.refresh()

            assertEquals(listOf("1", "2"), repository.tasks.value.map { it.id })
        }

    @Test
    fun refreshRethrowsInsteadOfSwallowing() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } throws RuntimeException("network down")

            try {
                repository.refresh()
                assertTrue(false, "should have thrown")
            } catch (e: RuntimeException) {
                assertEquals("network down", e.message)
            }
        }

    @Test
    fun refreshDoesNothingInLocalMode() =
        runTest {
            val local = AiTaskRepository(api, NoopErrorReporter(), appModeManager(AppMode.LOCAL))

            local.refresh()

            coVerify(exactly = 0) { api.listAiTasks(limit = 100) }
            assertTrue(local.tasks.value.isEmpty())
        }

    @Test
    fun deleteRemovesTheTaskFromTheList() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } returns
                AiTasksResponse(tasks = listOf(TestFixtures.aiTask(id = "1"), TestFixtures.aiTask(id = "2")), total = 2)
            repository.refresh()
            coEvery { api.deleteAiTask("1") } returns Unit

            repository.delete("1")

            assertEquals(listOf("2"), repository.tasks.value.map { it.id })
        }

    /**
     * An edit PATCHes the server and must replace the cached row with whatever the
     * server actually stored — not merge or drop it — so an edited description or
     * meal type shows up without waiting for the next refresh.
     */
    @Test
    fun updateReplacesTheTaskInPlace() =
        runTest {
            val original = TestFixtures.aiTask(id = "1", description = "Oatmeal")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(original), total = 1)
            repository.refresh()

            val update = AiTaskUpdate(description = "Oatmeal with berries")
            val serverResult = original.copy(description = "Oatmeal with berries")
            coEvery { api.updateAiTask("1", update, clearedKeys = listOf("mealType")) } returns serverResult

            val result = repository.update("1", update, listOf("mealType"))

            assertEquals("Oatmeal with berries", result.description)
            assertEquals(listOf("Oatmeal with berries"), repository.tasks.value.map { it.description })
        }

    @Test
    fun uploadPhotosDelegatesToTheApi() =
        runTest {
            val photos = listOf("meal_0.jpg" to byteArrayOf(1, 2, 3))
            coEvery { api.uploadAiTaskPhotos(photos) } returns listOf("/uploads/new.webp")

            val urls = repository.uploadPhotos(photos)

            assertEquals(listOf("/uploads/new.webp"), urls)
            coVerify { api.uploadAiTaskPhotos(photos) }
        }
}
