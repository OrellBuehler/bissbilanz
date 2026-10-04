package com.bissbilanz.android.aitasks

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.api.McpClientInfo
import com.bissbilanz.api.McpConnection
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = McpConnectionStoreTest.TestApp::class)
class McpConnectionStoreTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun store(): McpConnectionStore {
        context
            .getSharedPreferences("mcp_connection", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        return McpConnectionStore(context)
    }

    @Test
    fun defaultsToNotConnected() {
        val state = store().state.value

        assertFalse(state.connected)
        assertEquals(emptyList(), state.clientNames)
    }

    @Test
    fun refreshStoresTheAnswerAndSortedClientNames() =
        runTest {
            val store = store()

            store.refresh {
                McpConnection(true, listOf(McpClientInfo("ChatGPT", null), McpClientInfo("Claude", "claude.ai")))
            }

            assertTrue(store.state.value.connected)
            assertEquals(listOf("ChatGPT", "Claude"), store.state.value.clientNames)
        }

    @Test
    fun refreshAgainstAnOlderServerWithoutClientsStaysConnected() =
        runTest {
            val store = store()

            store.refresh { McpConnection(true) }

            assertTrue(store.state.value.connected)
            assertEquals(emptyList(), store.state.value.clientNames)
        }

    @Test
    fun theLastKnownAnswerSurvivesARestart() =
        runTest {
            store().refresh { McpConnection(true, listOf(McpClientInfo("Claude", null))) }

            val restarted = McpConnectionStore(context).state.value

            assertTrue(restarted.connected)
            assertEquals(listOf("Claude"), restarted.clientNames)
        }

    @Test
    fun aFailedRefreshFailsClosedOnAFreshInstall() =
        runTest {
            val store = store()

            assertFailsWith<IOException> { store.refresh { throw IOException("offline") } }

            assertFalse(store.state.value.connected)
        }

    @Test
    fun aFailedRefreshKeepsTheLastKnownAnswer() =
        runTest {
            val store = store()
            store.refresh { McpConnection(true, listOf(McpClientInfo("Claude", null))) }

            assertFailsWith<IOException> { store.refresh { throw IOException("offline") } }

            assertTrue(store.state.value.connected)
            assertEquals(listOf("Claude"), store.state.value.clientNames)
        }

    @Test
    fun clearForgetsTheCachedAnswerForTheNextAccount() =
        runTest {
            val store = store()
            store.refresh { McpConnection(true, listOf(McpClientInfo("Claude", null))) }

            store.clear()

            assertFalse(store.state.value.connected)
            assertEquals(emptyList(), store.state.value.clientNames)
            val restarted = McpConnectionStore(context).state.value
            assertFalse(restarted.connected)
            assertEquals(emptyList(), restarted.clientNames)
        }

    @Test
    fun aRefreshReportingDisconnectedClearsTheCache() =
        runTest {
            val store = store()
            store.refresh { McpConnection(true, listOf(McpClientInfo("Claude", null))) }

            store.refresh { McpConnection(false) }

            assertFalse(store.state.value.connected)
            assertEquals(emptyList(), store.state.value.clientNames)
            assertFalse(McpConnectionStore(context).state.value.connected)
        }
}
