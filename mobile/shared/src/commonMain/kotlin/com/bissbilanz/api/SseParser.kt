package com.bissbilanz.api

data class SseMessage(
    val id: String?,
    val event: String?,
    val data: String,
)

/**
 * The line-level half of the `text/event-stream` format: feed it one line at a time (without
 * the line break) and it hands back a message whenever a blank line ends one. Comment lines
 * (`: ping`) and a block without `data` dispatch nothing; `retry:` is kept in [retryMillis].
 */
class SseParser {
    private val data = StringBuilder()
    private var hasData = false
    private var event: String? = null
    private var id: String? = null

    var lastEventId: String? = null
        private set

    var retryMillis: Long? = null
        private set

    fun feed(line: String): SseMessage? {
        if (line.isEmpty()) return dispatch()
        if (line.startsWith(":")) return null
        val colon = line.indexOf(':')
        val field = if (colon == -1) line else line.substring(0, colon)
        val value =
            when {
                colon == -1 -> ""
                line.length > colon + 1 && line[colon + 1] == ' ' -> line.substring(colon + 2)
                else -> line.substring(colon + 1)
            }
        when (field) {
            "data" -> {
                if (hasData) data.append('\n')
                data.append(value)
                hasData = true
            }
            "event" -> event = value
            "id" -> if ('\u0000' !in value) id = value
            "retry" -> value.toLongOrNull()?.takeIf { it >= 0 }?.let { retryMillis = it }
        }
        return null
    }

    private fun dispatch(): SseMessage? {
        id?.let { lastEventId = it }
        val message = if (hasData) SseMessage(id = id, event = event?.ifEmpty { null }, data = data.toString()) else null
        data.clear()
        hasData = false
        event = null
        id = null
        return message
    }
}
