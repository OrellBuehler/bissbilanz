package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.api.generated.model.AiTaskProposal
import com.bissbilanz.api.generated.model.AiTaskProposalItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = ClaudeProposalCardTest.TestApp::class)
class ClaudeProposalCardTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun item(
        id: String,
        name: String,
    ) = AiTaskProposalItem(
        id = id,
        name = name,
        quantityDescription = "2 pieces",
        foodId = null,
        recipeId = null,
        servings = 2.0,
        calories = 156.0,
        protein = 12.6,
        carbs = 1.2,
        fat = 10.6,
        fiber = 0.0,
    )

    private val proposal =
        AiTaskProposal(summary = "Two eggs and toast", items = listOf(item("a", "Egg"), item("b", "Toast")))

    private fun show(
        busy: Boolean = false,
        onLog: (List<String>) -> Unit = {},
        onDiscard: () -> Unit = {},
    ) {
        composeTestRule.setContent {
            BissbilanzTheme {
                ClaudeProposalCard(proposal = proposal, busy = busy, onLog = onLog, onDiscard = onDiscard)
            }
        }
    }

    @Test
    fun listsEveryItemWithItsSummaryAndMacros() {
        show()

        composeTestRule.onNodeWithText("Suggested entries").assertIsDisplayed()
        composeTestRule.onNodeWithText("Two eggs and toast").assertIsDisplayed()
        composeTestRule.onNodeWithText("Egg").assertIsDisplayed()
        composeTestRule.onNodeWithText("Toast").assertIsDisplayed()
    }

    @Test
    fun loggingWithEverythingSelectedSendsEveryItemId() {
        val logged = mutableListOf<List<String>>()
        show(onLog = { logged += it })

        composeTestRule.onNodeWithText("Log selected").performClick()

        assertEquals(listOf(listOf("a", "b")), logged)
    }

    @Test
    fun loggingASubsetSendsOnlyTheSelectedIds() {
        val logged = mutableListOf<List<String>>()
        show(onLog = { logged += it })

        composeTestRule.onNodeWithText("Toast").performClick()
        composeTestRule.onNodeWithText("Log selected").performClick()

        assertEquals(listOf(listOf("a")), logged)
    }

    @Test
    fun deselectingEverythingDisablesLoggingAndExplainsWhy() {
        show()

        composeTestRule.onNodeWithText("Egg").performClick()
        composeTestRule.onNodeWithText("Toast").performClick()

        composeTestRule.onNodeWithText("Select at least one entry.").assertIsDisplayed()
        composeTestRule.onNodeWithText("Log selected").assertIsNotEnabled()
    }

    @Test
    fun aRegeneratedProposalKeepsTheSurvivingSelectionAndSelectsNewItems() {
        val logged = mutableListOf<List<String>>()
        var current by mutableStateOf(proposal)
        composeTestRule.setContent {
            BissbilanzTheme {
                ClaudeProposalCard(proposal = current, busy = false, onLog = { logged += it }, onDiscard = {})
            }
        }
        composeTestRule.onNodeWithText("Toast").performClick()

        current = AiTaskProposal(summary = null, items = listOf(item("a", "Egg"), item("b", "Toast"), item("c", "Jam")))
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Log selected").performClick()

        assertEquals(listOf(listOf("a", "c")), logged)
    }

    @Test
    fun anItemThatVanishesIsDroppedFromTheLoggedIds() {
        val logged = mutableListOf<List<String>>()
        var current by mutableStateOf(proposal)
        composeTestRule.setContent {
            BissbilanzTheme {
                ClaudeProposalCard(proposal = current, busy = false, onLog = { logged += it }, onDiscard = {})
            }
        }

        current = AiTaskProposal(summary = null, items = listOf(item("b", "Toast")))
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Log selected").performClick()

        assertEquals(listOf(listOf("b")), logged)
    }

    @Test
    fun theSameProposalKeepsTheSelectionAcrossARefresh() {
        val logged = mutableListOf<List<String>>()
        var current by mutableStateOf(proposal)
        composeTestRule.setContent {
            BissbilanzTheme {
                ClaudeProposalCard(proposal = current, busy = false, onLog = { logged += it }, onDiscard = {})
            }
        }
        composeTestRule.onNodeWithText("Toast").performClick()

        current = proposal.copy(summary = "Updated summary")
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Log selected").performClick()

        assertEquals(listOf(listOf("a")), logged)
    }

    @Test
    fun discardingCallsBack() {
        var discarded = false
        show(onDiscard = { discarded = true })

        composeTestRule.onNodeWithText("Discard").performClick()

        assertEquals(true, discarded)
    }

    @Test
    fun buttonsAreDisabledWhileBusy() {
        show(busy = true)

        composeTestRule.onNodeWithText("Log selected").assertIsNotEnabled()
        composeTestRule.onNodeWithText("Discard").assertIsNotEnabled()
    }

    @Test
    fun buttonsAreEnabledWhenIdle() {
        show()

        composeTestRule.onNodeWithText("Log selected").assertIsEnabled()
        composeTestRule.onNodeWithText("Discard").assertIsEnabled()
    }
}
