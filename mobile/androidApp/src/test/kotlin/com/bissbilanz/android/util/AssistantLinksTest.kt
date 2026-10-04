package com.bissbilanz.android.util

import org.junit.Test
import java.net.URLDecoder
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AssistantLinksTest {
    @Test
    fun serverUrlAppendsTheMcpPath() {
        assertEquals("https://app.example.com/api/mcp", AssistantLinks.serverUrl("https://app.example.com"))
    }

    @Test
    fun serverUrlIgnoresATrailingSlash() {
        assertEquals("https://app.example.com/api/mcp", AssistantLinks.serverUrl("https://app.example.com/"))
    }

    @Test
    fun installLinkPrefillsTheAddCustomConnectorDialog() {
        assertEquals(
            "https://claude.ai/customize/connectors?modal=add-custom-connector" +
                "&connectorName=Bissbilanz" +
                "&connectorUrl=https%3A%2F%2Fapp.example.com%2Fapi%2Fmcp",
            AssistantLinks.claudeInstallLink("https://app.example.com", directoryListingUrl = null),
        )
    }

    @Test
    fun installLinkEncodesAServerUrlWithAPortAndQuerySafeCharacters() {
        val link = AssistantLinks.claudeInstallLink("http://10.0.2.2:5173", directoryListingUrl = null)
        val connectorUrl = link.substringAfter("connectorUrl=")

        assertEquals("http%3A%2F%2F10.0.2.2%3A5173%2Fapi%2Fmcp", connectorUrl)
        assertEquals("http://10.0.2.2:5173/api/mcp", URLDecoder.decode(connectorUrl, "UTF-8"))
    }

    @Test
    fun aDirectoryListingWinsOverTheDialogLink() {
        assertEquals(
            "https://claude.ai/directory/connectors/bissbilanz",
            AssistantLinks.claudeInstallLink(
                "https://app.example.com",
                directoryListingUrl = "https://claude.ai/directory/connectors/bissbilanz",
            ),
        )
    }

    @Test
    fun noDirectoryListingIsConfiguredYet() {
        assertNull(AssistantLinks.DIRECTORY_LISTING_URL)
    }
}
