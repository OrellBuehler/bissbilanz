package com.bissbilanz.chat

import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatMessagePart
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChatRefreshPlanTest {
    @Test
    fun scopedChangesKeepTheirDatesAndIds() {
        val plan =
            ChatRefreshPlan.of(
                changed = listOf(ChatDomain.ENTRIES, ChatDomain.FOODS),
                changes =
                    listOf(
                        ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18")),
                        ChatChange(domain = ChatDomain.FOODS, ids = listOf("f1")),
                    ),
            )

        assertEquals(ChatChangeScope(dates = setOf("2026-11-18")), plan[ChatDomain.ENTRIES])
        assertEquals(ChatChangeScope(ids = setOf("f1")), plan[ChatDomain.FOODS])
    }

    @Test
    fun anEntryWithoutScopeAndADomainOnlyInChangedMeanTheWholeDomain() {
        val plan =
            ChatRefreshPlan.of(
                changed = listOf(ChatDomain.ENTRIES, ChatDomain.GOALS),
                changes = listOf(ChatChange(domain = ChatDomain.ENTRIES)),
            )

        assertEquals(ChatChangeScope.EVERYTHING, plan[ChatDomain.ENTRIES])
        assertEquals(ChatChangeScope.EVERYTHING, plan[ChatDomain.GOALS])
    }

    @Test
    fun plansMergeAcrossEvents() {
        val first = ChatRefreshPlan.of(null, listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18"))))
        val second = ChatRefreshPlan.of(null, listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-19"))))
        val unscoped = ChatRefreshPlan.of(listOf(ChatDomain.ENTRIES), null)

        assertEquals(setOf("2026-11-18", "2026-11-19"), (first + second)[ChatDomain.ENTRIES]?.dates)
        assertTrue((first + unscoped)[ChatDomain.ENTRIES]!!.everything)
    }

    @Test
    fun theFastingReminderAndMealTypeDomainsKeepTheirIds() {
        val plan =
            ChatRefreshPlan.of(
                listOf(ChatDomain.FASTING, ChatDomain.REMINDERS, ChatDomain.MEAL_TYPES, ChatDomain.PREFERENCES),
                listOf(
                    ChatChange(domain = ChatDomain.FASTING, ids = listOf("f1")),
                    ChatChange(domain = ChatDomain.REMINDERS, ids = listOf("r1")),
                    ChatChange(domain = ChatDomain.MEAL_TYPES, ids = listOf("m1")),
                ),
            )

        assertEquals(ChatChangeScope(ids = setOf("f1")), plan[ChatDomain.FASTING])
        assertEquals(ChatChangeScope(ids = setOf("r1")), plan[ChatDomain.REMINDERS])
        assertEquals(ChatChangeScope(ids = setOf("m1")), plan[ChatDomain.MEAL_TYPES])
        assertEquals(ChatChangeScope.EVERYTHING, plan[ChatDomain.PREFERENCES])
    }

    @Test
    fun theSameScopeTwiceStaysInThePlan() {
        val logged = ChatRefreshPlan.of(null, listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18"))))
        val deleted = ChatRefreshPlan.of(null, listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18"))))

        assertEquals(ChatChangeScope(dates = setOf("2026-11-18")), (logged + deleted)[ChatDomain.ENTRIES])
        assertEquals(logged, logged + ChatRefreshPlan.EMPTY)
    }

    @Test
    fun aRunsChangesCanBeReadBackFromItsToolParts() {
        val message =
            ChatFixtures.assistantMessage(
                listOf(
                    ChatMessagePart(type = ChatPartType.TEXT, text = "Done"),
                    ChatMessagePart(
                        type = ChatPartType.TOOL,
                        changed = listOf(ChatDomain.ENTRIES),
                        changes = listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18"))),
                    ),
                    ChatMessagePart(type = ChatPartType.TOOL, changed = listOf(ChatDomain.GOALS)),
                ),
            )

        val plan = ChatRefreshPlan.ofRun(listOf(ChatFixtures.userMessage(), message), ChatFixtures.RUN)

        assertEquals(setOf("2026-11-18"), plan[ChatDomain.ENTRIES]?.dates)
        assertEquals(ChatChangeScope.EVERYTHING, plan[ChatDomain.GOALS])
        assertTrue(ChatRefreshPlan.ofRun(listOf(message), "another-run").isEmpty)
    }

    @Test
    fun nothingChangedIsAnEmptyPlan() {
        val plan = ChatRefreshPlan.of(emptyList(), emptyList())

        assertTrue(plan.isEmpty)
        assertNull(plan[ChatDomain.ENTRIES])
    }
}
