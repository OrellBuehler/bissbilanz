package com.bissbilanz.model

import com.bissbilanz.api.McpClientInfo
import com.bissbilanz.api.McpConnection
import com.bissbilanz.test.testJson
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class McpConnectionTest {
    @Test
    fun olderServerWithoutClientsDecodesToAnEmptyList() {
        val status = testJson.decodeFromString<McpConnection>("""{"connected":true}""")

        assertTrue(status.connected)
        assertEquals(emptyList(), status.clients)
    }

    @Test
    fun clientsDecodeWithAndWithoutAHost() {
        val status =
            testJson.decodeFromString<McpConnection>(
                """{"connected":true,"clients":[{"name":"Claude","host":"claude.ai"},{"name":"ChatGPT","host":null},{"name":"Other"}]}""",
            )

        assertEquals(
            listOf(
                McpClientInfo("Claude", "claude.ai"),
                McpClientInfo("ChatGPT", null),
                McpClientInfo("Other", null),
            ),
            status.clients,
        )
    }

    @Test
    fun unknownFieldsAreIgnored() {
        val status = testJson.decodeFromString<McpConnection>("""{"connected":false,"clients":[],"future":1}""")

        assertFalse(status.connected)
        assertEquals(emptyList(), status.clients)
    }
}
