package com.bissbilanz.android.images

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeStep
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Local mode's stand-in for the server's orphan cleanup: a photo whose row is gone
 * has to be deleted, and one attached moments ago — its form not saved yet — must
 * survive the sweep.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = LocalImageSweeperTest.TestApp::class)
class LocalImageSweeperTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val now = 1_800_000_000_000L
    private val dayMs = 24 * 60 * 60 * 1000L

    private fun photo(
        name: String,
        ageMs: Long,
    ): File = LocalImageStore.write(context, name, byteArrayOf(1)).also { it.setLastModified(now - ageMs) }

    @Test
    fun `deletes an old photo nothing references`() =
        runTest {
            val orphan = photo("local-orphan.jpg", ageMs = 2 * dayMs)

            sweepUnreferenced(context, referenced = emptySet(), now = now)

            assertTrue(!orphan.exists())
        }

    @Test
    fun `keeps a photo a food or recipe still points at`() =
        runTest {
            val local = photo("local-kept.jpg", ageMs = 2 * dayMs)
            val upload = photo("aaaaaaaa-1111.webp", ageMs = 2 * dayMs)

            sweepUnreferenced(
                context,
                referenced = setOf(LocalImageStore.fileUri(local), "/uploads/aaaaaaaa-1111.webp"),
                now = now,
            )

            assertTrue(local.exists())
            assertTrue(upload.exists())
        }

    @Test
    fun `keeps a just-attached photo inside the grace period`() =
        runTest {
            val fresh = photo("local-fresh.jpg", ageMs = dayMs / 2)

            sweepUnreferenced(context, referenced = emptySet(), now = now)

            assertTrue(fresh.exists())
        }

    @Test
    fun `a recipe references its cover and every step photo`() {
        val recipe =
            RecipeDetail(
                id = "r1",
                userId = "u",
                name = "Soup",
                totalServings = 2.0,
                isFavorite = false,
                imageUrl = "file:///cover.jpg",
                calories = 0.0,
                protein = 0.0,
                carbs = 0.0,
                fat = 0.0,
                fiber = 0.0,
                ingredients = emptyList(),
                steps =
                    listOf(
                        RecipeStep("s1", 0, "Chop", "file:///step-1.jpg"),
                        RecipeStep("s2", 1, "Stir", null),
                        RecipeStep("s3", 2, "Serve", "/uploads/aaaaaaaa-2222.webp"),
                    ),
            )

        assertEquals(
            listOf("file:///cover.jpg", "file:///step-1.jpg", "/uploads/aaaaaaaa-2222.webp"),
            recipe.referencedImageUrls(),
        )
        assertEquals(emptyList(), recipe.copy(imageUrl = null, steps = null).referencedImageUrls())
    }

    @Test
    fun `keeps a photo only a recipe step points at`() =
        runTest {
            val stepPhoto = photo("local-step.jpg", ageMs = 2 * dayMs)

            sweepUnreferenced(context, referenced = setOf(LocalImageStore.fileUri(stepPhoto)), now = now)

            assertTrue(stepPhoto.exists())
        }
}
