package com.bissbilanz.util

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskClaudeProcessing
import com.bissbilanz.api.generated.model.AiTaskProposal
import com.bissbilanz.api.generated.model.ClaudeCapability
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.test.TestFixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AiTaskProcessingTest {
    private val proposal = AiTaskProposal(summary = "Two eggs", items = listOf(TestFixtures.proposalItem()))

    private fun pendingWith(
        state: String,
        withProposal: Boolean = state == "proposed",
    ) = TestFixtures.aiTask(
        claudeProcessing = AiTaskClaudeProcessing(state = state, proposal = if (withProposal) proposal else null),
    )

    @Test
    fun theKindWinsOverTheLegacyProcessor() {
        val prefs = TestFixtures.preferences(Preferences.AiTaskProcessor.assistant, processorKind = "claude")

        assertEquals("claude", prefs.effectiveAiTaskProcessor())
        assertTrue(prefs.isClaudeSelected())
    }

    @Test
    fun withoutAKindTheLegacyProcessorIsUsed() {
        assertEquals("device", TestFixtures.preferences(Preferences.AiTaskProcessor.device).effectiveAiTaskProcessor())
        assertEquals("assistant", TestFixtures.preferences().effectiveAiTaskProcessor())
        assertFalse(TestFixtures.preferences().isClaudeSelected())
    }

    @Test
    fun anUnknownKindFallsBackToTheLegacyProcessor() {
        val device = TestFixtures.preferences(Preferences.AiTaskProcessor.device, processorKind = "future_processor")
        val assistant = TestFixtures.preferences(processorKind = "future_processor")

        assertEquals("device", device.effectiveAiTaskProcessor())
        assertEquals("assistant", assistant.effectiveAiTaskProcessor())
        assertFalse(assistant.isClaudeSelected())
    }

    @Test
    fun aMissingCapabilityIsUnavailable() {
        assertFalse((null as ClaudeCapability?).isClaudeAvailable())
        assertFalse(ClaudeCapability(available = false).isClaudeAvailable())
        assertTrue(ClaudeCapability(available = true, remainingBudgetUsd = 8.31).isClaudeAvailable())
    }

    @Test
    fun claudeProcessesOnlyWhenSelectedAndAvailable() {
        val claude = TestFixtures.preferences(processorKind = "claude")
        val assistant = TestFixtures.preferences(processorKind = "assistant")
        val available = ClaudeCapability(available = true)
        val unavailable = ClaudeCapability(available = false)

        assertTrue(claudeProcessingEnabled(claude, available))
        assertFalse(claudeProcessingEnabled(claude, unavailable))
        assertFalse(claudeProcessingEnabled(claude, null))
        assertFalse(claudeProcessingEnabled(assistant, available))
        assertFalse(claudeProcessingEnabled(null, available))
    }

    @Test
    fun everyKnownRunStateMapsToItsChip() {
        assertEquals(ClaudeTaskState.QUEUED, pendingWith("queued").claudeTaskState())
        assertEquals(ClaudeTaskState.RUNNING, pendingWith("running").claudeTaskState())
        assertEquals(ClaudeTaskState.RETRYING, pendingWith("retrying").claudeTaskState())
        assertEquals(ClaudeTaskState.PROPOSED, pendingWith("proposed").claudeTaskState())
        assertEquals(ClaudeTaskState.BLOCKED, pendingWith("blocked").claudeTaskState())
    }

    @Test
    fun anUnknownRunStateReadsAsQueued() {
        assertEquals(ClaudeTaskState.QUEUED, pendingWith("something_new").claudeTaskState())
    }

    @Test
    fun aProposedStateWithoutAProposalStillShowsTheProposedChip() {
        assertEquals(ClaudeTaskState.PROPOSED, pendingWith("proposed", withProposal = false).claudeTaskState())
    }

    @Test
    fun aPendingTaskWithoutARunHasNoChip() {
        assertNull(TestFixtures.aiTask().claudeTaskState())
    }

    @Test
    fun aTaskThatLeftPendingHasNoChip() {
        val task =
            TestFixtures.aiTask(
                status = AiTask.Status.completed,
                claudeProcessing = AiTaskClaudeProcessing(state = "running", proposal = null),
            )

        assertNull(task.claudeTaskState())
    }

    @Test
    fun theKindIsCheckedBeforeTheLegacyProcessedBy() {
        val task = TestFixtures.aiTask(processedBy = AiTask.ProcessedBy.assistant, processedByKind = "claude")

        assertEquals(TaskResolver.CLAUDE, task.resolver())
    }

    @Test
    fun anUnknownOrMissingKindFallsBackToTheLegacyField() {
        assertEquals(
            TaskResolver.ON_DEVICE,
            TestFixtures.aiTask(processedBy = AiTask.ProcessedBy.on_device, processedByKind = "future").resolver(),
        )
        assertEquals(
            TaskResolver.PRIVATE_CLOUD,
            TestFixtures.aiTask(processedBy = AiTask.ProcessedBy.private_cloud).resolver(),
        )
        assertEquals(TaskResolver.ASSISTANT, TestFixtures.aiTask(processedBy = AiTask.ProcessedBy.assistant).resolver())
        assertNull(TestFixtures.aiTask().resolver())
    }

    @Test
    fun theKnownKindsMapDirectly() {
        assertEquals(TaskResolver.ASSISTANT, TestFixtures.aiTask(processedByKind = "assistant").resolver())
        assertEquals(TaskResolver.ON_DEVICE, TestFixtures.aiTask(processedByKind = "on_device").resolver())
        assertEquals(TaskResolver.PRIVATE_CLOUD, TestFixtures.aiTask(processedByKind = "private_cloud").resolver())
    }

    @Test
    fun aRegeneratedProposalKeepsTheSurvivingSelectionAndSelectsNewItems() {
        val start = ProposalSelection.all(listOf("a", "b", "c")).toggled("c")

        val next = start.reconciled(listOf("a", "c", "d"))

        assertEquals(setOf("a", "d"), next.selected)
        assertEquals(setOf("a", "b", "c", "d"), next.seen)
    }

    @Test
    fun anItemThatVanishesAndReturnsIsNotReselected() {
        val start = ProposalSelection.all(listOf("a", "b")).toggled("b")

        val back = start.reconciled(listOf("a")).reconciled(listOf("a", "b"))

        assertEquals(setOf("a"), back.selected)
    }

    @Test
    fun anUnchangedProposalKeepsTheSelection() {
        val start = ProposalSelection.all(listOf("a", "b")).toggled("a")

        assertEquals(start, start.reconciled(listOf("a", "b")))
    }
}
