package com.bissbilanz.api

import kotlinx.serialization.Serializable

/**
 * One OAuth client the account has authorized against the MCP server. [host] is the
 * client's redirect host (e.g. claude.ai), null when the server has none to report.
 */
@Serializable
data class McpClientInfo(
    val name: String,
    val host: String? = null,
)

/**
 * `GET /api/mcp/status`. [clients] is additive on the server, so it defaults to empty
 * when an older server only sends [connected].
 *
 * Hand-written rather than generated so a regenerated spec cannot drop the default.
 */
@Serializable
data class McpConnection(
    val connected: Boolean,
    val clients: List<McpClientInfo> = emptyList(),
)
