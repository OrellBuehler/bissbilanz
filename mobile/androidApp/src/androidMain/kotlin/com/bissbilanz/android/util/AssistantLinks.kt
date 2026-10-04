package com.bissbilanz.android.util

import java.net.URLEncoder

object AssistantLinks {
    const val CONNECTOR_NAME = "Bissbilanz"
    const val CHATGPT_PLUGINS_URL = "https://chatgpt.com/plugins"

    /** Permanent listing in Claude's connector directory; set once the listing is approved. */
    val DIRECTORY_LISTING_URL: String? = null

    private const val CLAUDE_ADD_CONNECTOR_URL = "https://claude.ai/customize/connectors"

    fun serverUrl(baseUrl: String): String = "${baseUrl.trimEnd('/')}/api/mcp"

    /**
     * Where "Connect to Claude" goes: the directory listing when there is one, otherwise the
     * "add custom connector" dialog prefilled with the server URL.
     */
    fun claudeInstallLink(
        baseUrl: String,
        directoryListingUrl: String? = DIRECTORY_LISTING_URL,
    ): String =
        directoryListingUrl
            ?: "$CLAUDE_ADD_CONNECTOR_URL?modal=add-custom-connector" +
            "&connectorName=${encode(CONNECTOR_NAME)}" +
            "&connectorUrl=${encode(serverUrl(baseUrl))}"

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
