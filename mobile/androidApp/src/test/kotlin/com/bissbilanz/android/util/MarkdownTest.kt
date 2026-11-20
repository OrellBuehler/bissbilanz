package com.bissbilanz.android.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MarkdownTest {
    private fun plain(text: String) = MdSpan(text)

    @Test
    fun paragraphsSplitOnBlankLinesAndKeepSingleLineBreaks() {
        val blocks = Markdown.parse("First line\nsecond line\n\nNext paragraph")

        assertEquals(
            listOf(
                MdBlock.Paragraph(listOf(plain("First line\nsecond line"))),
                MdBlock.Paragraph(listOf(plain("Next paragraph"))),
            ),
            blocks,
        )
    }

    @Test
    fun boldItalicAndCodeBecomeStyledSpans() {
        assertEquals(
            listOf(
                plain("You had "),
                MdSpan("120 kcal", bold = true),
                plain(" from "),
                MdSpan("yogurt", italic = true),
                plain(" ("),
                MdSpan("log_food", code = true),
                plain(")"),
            ),
            Markdown.inline("You had **120 kcal** from *yogurt* (`log_food`)"),
        )
    }

    @Test
    fun stylesNest() {
        assertEquals(
            listOf(MdSpan("very ", italic = true), MdSpan("good", bold = true, italic = true)),
            Markdown.inline("*very **good***"),
        )
        assertEquals(listOf(MdSpan("both", bold = true, italic = true)), Markdown.inline("***both***"))
    }

    @Test
    fun unclosedMarkersStayLiteralWhileAnAnswerStreams() {
        assertEquals(listOf(plain("Logging **150 g")), Markdown.inline("Logging **150 g"))
        assertEquals(listOf(plain("2 * 3 * 4")), Markdown.inline("2 * 3 * 4"))
    }

    @Test
    fun underscoresInsideWordsAreNotItalic() {
        assertEquals(listOf(plain("use log_food_entry here")), Markdown.inline("use log_food_entry here"))
        assertEquals(listOf(MdSpan("this", italic = true)), Markdown.inline("_this_"))
    }

    @Test
    fun linksKeepTheirLabelAndOnlySafeUrlsAreClickable() {
        assertEquals(
            listOf(plain("See "), MdSpan("the guide", url = "https://example.com/help"), plain(".")),
            Markdown.inline("See [the guide](https://example.com/help)."),
        )
        assertEquals(listOf(plain("tap")), Markdown.inline("[tap](javascript:alert)"))
    }

    @Test
    fun bareUrlsAreLinkedWithoutTrailingPunctuation() {
        assertEquals(
            listOf(
                plain("Source: "),
                MdSpan("https://world.openfoodfacts.org/product/1", url = "https://world.openfoodfacts.org/product/1"),
                plain("."),
            ),
            Markdown.inline("Source: https://world.openfoodfacts.org/product/1."),
        )
    }

    @Test
    fun escapedMarkersAreLiteral() {
        assertEquals(listOf(plain("*not italic*")), Markdown.inline("\\*not italic\\*"))
    }

    @Test
    fun headingsListsQuotesRulesAndCode() {
        val blocks =
            Markdown.parse(
                """
                ## Today
                - Breakfast: **yogurt**
                  with honey
                  - nested
                1. First
                2) Second
                > A quote
                ---
                ```
                raw *text*
                ```
                """.trimIndent(),
            )

        assertEquals(
            listOf(
                MdBlock.Heading(2, listOf(plain("Today"))),
                MdBlock.ListItem(null, 0, listOf(plain("Breakfast: "), MdSpan("yogurt", bold = true), plain("\nwith honey"))),
                MdBlock.ListItem(null, 1, listOf(plain("nested"))),
                MdBlock.ListItem(1, 0, listOf(plain("First"))),
                MdBlock.ListItem(2, 0, listOf(plain("Second"))),
                MdBlock.Quote(listOf(plain("A quote"))),
                MdBlock.Rule,
                MdBlock.Code("raw *text*"),
            ),
            blocks,
        )
    }

    @Test
    fun aBoldLineIsNotAList() {
        assertEquals(
            listOf(MdBlock.Paragraph(listOf(MdSpan("Total", bold = true), plain(": 1800 kcal")))),
            Markdown.parse("**Total**: 1800 kcal"),
        )
    }

    @Test
    fun anUnterminatedFenceTakesTheRest() {
        assertEquals(listOf(MdBlock.Paragraph(listOf(plain("Code:"))), MdBlock.Code("a\nb")), Markdown.parse("Code:\n```\na\nb"))
    }

    @Test
    fun onlyWebAndMailLinksAreSafe() {
        assertTrue(Markdown.isSafeUrl("https://x.y"))
        assertTrue(Markdown.isSafeUrl("mailto:a@b.c"))
        assertFalse(Markdown.isSafeUrl("intent://x"))
        assertFalse(Markdown.isSafeUrl("file:///data"))
    }

    @Test
    fun emptyTextHasNoBlocks() {
        assertEquals(emptyList(), Markdown.parse(""))
        assertEquals(emptyList(), Markdown.parse("\n\n"))
    }
}
