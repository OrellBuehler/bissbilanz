package com.bissbilanz.android.ui.screens

import android.app.Application
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.viewmodels.EnhanceFoodsViewModel
import com.bissbilanz.api.generated.model.FoodEnrichmentJob
import com.bissbilanz.api.generated.model.FoodEnrichmentStatusResponse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "de-w411dp-h891dp", application = EnhanceFoodsContentTest.TestApp::class)
class EnhanceFoodsContentTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun job(
        state: String,
        processed: Int = 2,
    ) = FoodEnrichmentJob(state, 5, processed, 1, 1, 0, "2026-11-12T10:00:00Z", "2026-11-12T10:05:00Z")

    private fun show(
        state: EnhanceFoodsViewModel.UiState,
        isOnline: Boolean = true,
    ) {
        composeTestRule.setContent {
            BissbilanzTheme {
                EnhanceFoodsContent(
                    status = state.status!!,
                    state = state,
                    isOnline = isOnline,
                    onStart = { calls += "start" },
                    onStop = { calls += "stop" },
                    onRetry = { calls += "retry" },
                )
            }
        }
    }

    private fun state(
        job: FoodEnrichmentJob? = null,
        candidates: Int = 5,
        loadFailures: Int = 0,
        rateLimited: Boolean = false,
        hasBarcodeFoods: Boolean = true,
    ) = EnhanceFoodsViewModel.UiState(
        status = FoodEnrichmentStatusResponse(candidates = candidates, job = job),
        loadFailures = loadFailures,
        rateLimited = rateLimited,
        hasBarcodeFoods = hasBarcodeFoods,
    )

    @Test
    fun withoutARunItOffersToStartWithTheCandidateCount() {
        show(state())

        composeTestRule.onNodeWithText("Zu prüfende Lebensmittel: 5").assertExists()
        composeTestRule.onNodeWithText("Starten").assertIsEnabled().performClick()
        composeTestRule.onNodeWithText("Stoppen").assertDoesNotExist()
        assertEquals(listOf("start"), calls)
    }

    @Test
    fun withNothingLeftToCheckStartIsDisabled() {
        show(state(candidates = 0))

        composeTestRule.onNodeWithText("Alle Lebensmittel mit Barcode wurden geprüft.").assertExists()
        composeTestRule.onNodeWithText("Starten").assertIsNotEnabled()
    }

    @Test
    fun withoutAnyBarcodeFoodItSaysSoInsteadOfAllChecked() {
        show(state(candidates = 0, hasBarcodeFoods = false))

        composeTestRule.onNodeWithText("Noch keines deiner Lebensmittel hat einen Barcode", substring = true).assertExists()
        composeTestRule.onNodeWithText("Alle Lebensmittel mit Barcode wurden geprüft.").assertDoesNotExist()
        composeTestRule.onNodeWithText("Starten").assertIsNotEnabled()
    }

    @Test
    fun aRunningJobShowsProgressCountsAndStop() {
        show(state(job("running")))

        composeTestRule.onNodeWithText("40", substring = true).assertExists()
        composeTestRule.onNodeWithText("2 von 5 geprüft").assertExists()
        composeTestRule.onNodeWithText("1 angereichert · 1 nicht gefunden · 0 fehlgeschlagen").assertExists()
        composeTestRule.onNodeWithText("Stoppen").assertIsEnabled().performClick()
        composeTestRule.onNodeWithText("Starten").assertDoesNotExist()
        assertEquals(listOf("stop"), calls)
    }

    @Test
    fun aQueuedJobSaysItIsStarting() {
        show(state(job("queued", processed = 0)))

        composeTestRule.onNodeWithText("Wird gestartet…").assertExists()
        composeTestRule.onNodeWithText("%", substring = true).assertDoesNotExist()
    }

    @Test
    fun theLastRunIsSummarisedByHowItEnded() {
        show(state(job("completed", processed = 5), candidates = 0))
        composeTestRule.onNodeWithText("Letzter Lauf", substring = true).assertExists()
        composeTestRule.onNodeWithText(": 5 geprüft", substring = true).assertExists()
    }

    @Test
    fun aCancelledRunSaysWhereItStopped() {
        show(state(job("cancelled")))

        composeTestRule.onNodeWithText("nach 2 von 5", substring = true).assertExists()
        composeTestRule.onNodeWithText("Gestoppt", substring = true).assertExists()
    }

    @Test
    fun aFailedRunAsksToTryLater() {
        show(state(job("failed")))

        composeTestRule.onNodeWithText("wegen wiederholter Fehler", substring = true).assertExists()
    }

    @Test
    fun anUnknownStateIsShownAsAFinishedRun() {
        show(state(job("paused", processed = 3)))

        composeTestRule.onNodeWithText(": 3 geprüft", substring = true).assertExists()
        composeTestRule.onNodeWithText("Starten").assertIsEnabled()
    }

    @Test
    fun offlineSaysSoAndDisablesTheActions() {
        show(state(job("running")), isOnline = false)

        composeTestRule.onNodeWithText("Zum Anreichern ist eine Internetverbindung nötig.").assertExists()
        composeTestRule.onNodeWithText("Stoppen").assertIsNotEnabled()
    }

    @Test
    fun aRateLimitDisablesTheActionsAndSaysWhy() {
        show(state(rateLimited = true))

        composeTestRule.onNodeWithText("Zu viele Anfragen. Bitte warte eine Minute.").assertExists()
        composeTestRule.onNodeWithText("Starten").assertIsNotEnabled()
    }

    @Test
    fun aStalledStatusOffersARetry() {
        show(state(job("running"), loadFailures = EnhanceFoodsViewModel.MAX_LOAD_FAILURES))

        composeTestRule.onNodeWithText("Der Status konnte nicht geladen werden.").assertExists()
        composeTestRule.onNodeWithText("Wiederholen").performClick()
        assertEquals(listOf("retry"), calls)
    }
}
