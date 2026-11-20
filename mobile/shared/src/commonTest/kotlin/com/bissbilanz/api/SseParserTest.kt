package com.bissbilanz.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SseParserTest {
    private fun SseParser.feedAll(text: String): List<SseMessage> = text.split("\n").mapNotNull { feed(it) }

    @Test
    fun aBlockOfFieldsBecomesOneMessage() {
        val parser = SseParser()

        val messages = parser.feedAll("id: 3\nevent: text_delta\ndata: {\"seq\":3}\n\n")

        assertEquals(listOf(SseMessage(id = "3", event = "text_delta", data = "{\"seq\":3}")), messages)
        assertEquals("3", parser.lastEventId)
    }

    @Test
    fun commentsAndTheRetryBlockDispatchNothingButRetryIsKept() {
        val parser = SseParser()

        val messages = parser.feedAll("retry: 3000\n\n: ping\n\n")

        assertEquals(emptyList(), messages)
        assertEquals(3000L, parser.retryMillis)
    }

    @Test
    fun multipleDataLinesJoinWithNewlines() {
        val messages = SseParser().feedAll("data: first\ndata: second\n\n")

        assertEquals("first\nsecond", messages.single().data)
    }

    @Test
    fun onlyOneLeadingSpaceIsStrippedAndAFieldWithoutColonHasNoValue() {
        val messages = SseParser().feedAll("data:  two spaces\n\ndata\n\n")

        assertEquals(listOf(" two spaces", ""), messages.map { it.data })
    }

    @Test
    fun fieldsDoNotLeakIntoTheNextMessage() {
        val messages = SseParser().feedAll("id: 1\nevent: a\ndata: x\n\ndata: y\n\n")

        assertEquals(SseMessage(id = null, event = null, data = "y"), messages[1])
    }

    @Test
    fun unknownFieldsAndABadRetryAreIgnored() {
        val parser = SseParser()

        val messages = parser.feedAll("foo: bar\nretry: soon\ndata: z\n\n")

        assertEquals("z", messages.single().data)
        assertNull(parser.retryMillis)
    }

    @Test
    fun anUnterminatedBlockIsNotDispatched() {
        assertEquals(emptyList(), SseParser().feedAll("data: half"))
    }
}
