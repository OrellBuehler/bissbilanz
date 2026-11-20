package com.bissbilanz.android.util

/** A run of text with the inline styles that apply to all of it. */
data class MdSpan(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
    val url: String? = null,
)

sealed interface MdBlock {
    data class Paragraph(
        val spans: List<MdSpan>,
    ) : MdBlock

    data class Heading(
        val level: Int,
        val spans: List<MdSpan>,
    ) : MdBlock

    /** One list item; [number] is set for an ordered list, [depth] counts nesting from 0. */
    data class ListItem(
        val number: Int?,
        val depth: Int,
        val spans: List<MdSpan>,
    ) : MdBlock

    data class Quote(
        val spans: List<MdSpan>,
    ) : MdBlock

    data class Code(
        val text: String,
    ) : MdBlock

    data object Rule : MdBlock
}

/**
 * The Markdown subset assistant answers use: paragraphs, headings, bullet and numbered lists,
 * quotes, fenced code, rules, and inline bold, italic, code and links. Anything it does not
 * recognise stays literal text, so a half-streamed `**bold` shows as typed until its closing
 * marker arrives. Single line breaks are kept, the way chat text is meant.
 */
object Markdown {
    private val heading = Regex("""^(#{1,6})\s+(.*?)\s*#*\s*$""")
    private val bullet = Regex("""^(\s*)[-*+]\s+(.*)$""")
    private val ordered = Regex("""^(\s*)(\d{1,9})[.)]\s+(.*)$""")
    private val rule = Regex("""^\s*([-*_])(\s*\1){2,}\s*$""")
    private val quote = Regex("""^\s*>\s?(.*)$""")
    private val fence = Regex("""^\s*```.*$""")

    private const val MAX_DEPTH = 3

    fun parse(markdown: String): List<MdBlock> {
        val blocks = mutableListOf<MdBlock>()
        val paragraph = mutableListOf<String>()
        var item: PendingItem? = null
        val lines = markdown.replace("\r\n", "\n").split('\n')

        fun flush() {
            if (paragraph.isNotEmpty()) blocks += MdBlock.Paragraph(inline(paragraph.joinToString("\n")))
            paragraph.clear()
            item?.let { blocks += MdBlock.ListItem(it.number, it.depth, inline(it.lines.joinToString("\n"))) }
            item = null
        }

        var index = 0
        while (index < lines.size) {
            val line = lines[index]
            index++
            if (fence.matches(line)) {
                flush()
                val code = mutableListOf<String>()
                while (index < lines.size && !fence.matches(lines[index])) code += lines[index++]
                index++
                blocks += MdBlock.Code(code.joinToString("\n"))
                continue
            }
            if (line.isBlank()) {
                flush()
                continue
            }
            val headingMatch = heading.matchEntire(line)
            if (headingMatch != null) {
                flush()
                blocks += MdBlock.Heading(headingMatch.groupValues[1].length, inline(headingMatch.groupValues[2]))
                continue
            }
            if (rule.matches(line)) {
                flush()
                blocks += MdBlock.Rule
                continue
            }
            val bulletMatch = bullet.matchEntire(line)
            val orderedMatch = if (bulletMatch == null) ordered.matchEntire(line) else null
            if (bulletMatch != null || orderedMatch != null) {
                flush()
                val indent = (bulletMatch ?: orderedMatch)!!.groupValues[1].replace("\t", "    ").length
                item =
                    PendingItem(
                        number = orderedMatch?.groupValues?.get(2)?.toIntOrNull(),
                        depth = (indent / 2).coerceAtMost(MAX_DEPTH),
                        lines = mutableListOf(bulletMatch?.groupValues?.get(2) ?: orderedMatch!!.groupValues[3]),
                    )
                continue
            }
            val quoteMatch = quote.matchEntire(line)
            if (quoteMatch != null) {
                flush()
                val quoted = mutableListOf(quoteMatch.groupValues[1])
                while (index < lines.size) {
                    val next = quote.matchEntire(lines[index]) ?: break
                    quoted += next.groupValues[1]
                    index++
                }
                blocks += MdBlock.Quote(inline(quoted.joinToString("\n")))
                continue
            }
            val pending = item
            if (pending != null) pending.lines += line.trim() else paragraph += line
        }
        flush()
        return blocks
    }

    private class PendingItem(
        val number: Int?,
        val depth: Int,
        val lines: MutableList<String>,
    )

    fun inline(text: String): List<MdSpan> = merge(InlineParser(text).parse(MdSpan("")))

    private fun merge(spans: List<MdSpan>): List<MdSpan> {
        val merged = mutableListOf<MdSpan>()
        spans.filter { it.text.isNotEmpty() }.forEach { span ->
            val last = merged.lastOrNull()
            if (last != null && last.copy(text = "") == span.copy(text = "")) {
                merged[merged.lastIndex] = last.copy(text = last.text + span.text)
            } else {
                merged += span
            }
        }
        return merged
    }

    private class InlineParser(
        private val text: String,
    ) {
        fun parse(style: MdSpan): List<MdSpan> = parseRange(0, text.length, style)

        private fun parseRange(
            start: Int,
            end: Int,
            style: MdSpan,
        ): List<MdSpan> {
            val spans = mutableListOf<MdSpan>()
            val buffer = StringBuilder()

            fun flush() {
                if (buffer.isNotEmpty()) spans += style.copy(text = buffer.toString())
                buffer.clear()
            }

            var i = start
            while (i < end) {
                val c = text[i]
                when {
                    c == '\\' && i + 1 < end && text[i + 1] in ESCAPABLE -> {
                        buffer.append(text[i + 1])
                        i += 2
                    }
                    c == '`' -> {
                        val close = text.indexOf('`', i + 1).takeIf { it in (i + 2)..<end }
                        if (close == null) {
                            buffer.append(c)
                            i++
                        } else {
                            flush()
                            spans += style.copy(text = text.substring(i + 1, close), code = true)
                            i = close + 1
                        }
                    }
                    (c == '*' || (c == '_' && wordBoundaryBefore(i))) && i + 1 < end && text[i + 1] == c && opens(i + 2, end) -> {
                        val marker = "$c$c"
                        val close = closing(marker, i + 2, end)
                        if (close == null) {
                            buffer.append(marker)
                            i += 2
                        } else {
                            flush()
                            spans += parseRange(i + 2, close, style.copy(bold = true))
                            i = close + 2
                        }
                    }
                    (c == '*' || (c == '_' && wordBoundaryBefore(i))) && opens(i + 1, end) -> {
                        val close = closing(c.toString(), i + 1, end)
                        if (close == null) {
                            buffer.append(c)
                            i++
                        } else {
                            flush()
                            spans += parseRange(i + 1, close, style.copy(italic = true))
                            i = close + 1
                        }
                    }
                    c == '[' -> {
                        val link = link(i, end)
                        if (link == null) {
                            buffer.append(c)
                            i++
                        } else {
                            flush()
                            val (labelEnd, url, next) = link
                            val label = parseRange(i + 1, labelEnd, style)
                            spans += if (isSafeUrl(url)) label.map { it.copy(url = url) } else label
                            i = next
                        }
                    }
                    (c == 'h') && wordBoundaryBefore(i) && autolinkAt(i, end) != null -> {
                        flush()
                        val url = autolinkAt(i, end)!!
                        spans += style.copy(text = url, url = url)
                        i += url.length
                    }
                    else -> {
                        buffer.append(c)
                        i++
                    }
                }
            }
            flush()
            return spans
        }

        private fun opens(
            at: Int,
            end: Int,
        ): Boolean = at < end && !text[at].isWhitespace()

        private fun wordBoundaryBefore(at: Int): Boolean = at == 0 || !text[at - 1].isLetterOrDigit()

        /**
         * Where the [marker] opened before [from] closes: the next run of its character that
         * follows a non-space (and, for `_`, does not continue a word). A single marker skips
         * a double one, which belongs to bold; a run of three closes both.
         */
        private fun closing(
            marker: String,
            from: Int,
            end: Int,
        ): Int? {
            val c = marker[0]
            var at = from + 1
            while (at < end) {
                if (text[at] != c) {
                    at++
                    continue
                }
                var run = 0
                while (at + run < end && text[at + run] == c) run++
                val validBefore = !text[at - 1].isWhitespace()
                val validAfter = c != '_' || at + run >= text.length || !text[at + run].isLetterOrDigit()
                if (validBefore && validAfter) {
                    if (marker.length == 2 && run >= 2) return at + run - 2
                    if (marker.length == 1 && (run == 1 || run == 3)) return at + run - 1
                }
                at += run
            }
            return null
        }

        private fun link(
            at: Int,
            end: Int,
        ): Triple<Int, String, Int>? {
            var depth = 0
            var labelEnd = -1
            for (j in at + 1 until end) {
                when (text[j]) {
                    '[' -> depth++
                    ']' ->
                        if (depth == 0) {
                            labelEnd = j
                            break
                        } else {
                            depth--
                        }
                }
            }
            if (labelEnd <= at + 1 || labelEnd + 1 >= end || text[labelEnd + 1] != '(') return null
            // Parentheses inside the URL (Wikipedia's "Foo_(bar)") are balanced, not its end.
            var open = 0
            var close = -1
            for (j in labelEnd + 2 until end) {
                when (text[j]) {
                    '(' -> open++
                    ')' ->
                        if (open == 0) {
                            close = j
                            break
                        } else {
                            open--
                        }
                }
            }
            if (close == -1) return null
            val url = text.substring(labelEnd + 2, close).trim()
            if (url.isEmpty() || url.any { it.isWhitespace() }) return null
            return Triple(labelEnd, url, close + 1)
        }

        private fun autolinkAt(
            at: Int,
            end: Int,
        ): String? {
            if (!text.startsWith("https://", at) && !text.startsWith("http://", at)) return null
            var stop = at
            while (stop < end && !text[stop].isWhitespace() && text[stop] != '<' && text[stop] != '>') stop++
            while (stop > at && text[stop - 1] in TRAILING_PUNCTUATION && !closesParenthesis(at, stop)) stop--
            val url = text.substring(at, stop)
            return url.takeIf { it.length > "https://".length }
        }

        /** Whether the `)` that ends text[at, stop) closes a `(` opened inside the URL. */
        private fun closesParenthesis(
            at: Int,
            stop: Int,
        ): Boolean {
            if (text[stop - 1] != ')') return false
            val url = text.substring(at, stop)
            return url.count { it == '(' } >= url.count { it == ')' }
        }
    }

    fun isSafeUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.startsWith("https://") || lower.startsWith("http://")
    }

    private const val ESCAPABLE = "\\`*_[]()#+-.!>"
    private const val TRAILING_PUNCTUATION = ".,;:!?)]}'\""
}
