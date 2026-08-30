package com.bissbilanz.android.resources

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Android lint's StringFormatMatches checks getString()/String.format() call sites, but
 * not Compose's stringResource(). That gap let insights_meal_pct_format declare %2$d
 * while the legend passed a formatAsInt() String, crashing the Insights screen on every
 * render (Sentry BISSBILANZ-2V) through a green CI.
 *
 * So: resolve every stringResource()/getString() call against the resource it names and
 * fail when a String-typed argument lands on a numeric slot, or when the argument count
 * doesn't match the declared slots.
 *
 * Deliberately one-sided — it only reports arguments it can *prove* are Strings (a
 * literal, a known String-returning helper, or a local val holding one). Anything it
 * can't classify passes. It narrows the gap lint leaves; it isn't a type checker.
 * Call sites that stash the template and format it later (SimplePieChart) are invisible
 * to it, because the resource and the arguments never meet in one expression.
 */
class StringFormatArgumentTest {
    @Test
    fun everyFormatArgumentMatchesItsSlotType() {
        val root = moduleRoot()
        val specs = formatSpecs(File(root, "src/androidMain/res/values/strings.xml").readText())
        val problems = mutableListOf<String>()

        File(root, "src/androidMain/kotlin").walkTopDown().filter { it.extension == "kt" }.forEach { file ->
            val source = file.readText()
            val mask = codeMask(source)
            val locals = localVals(source)
            callSites(source, mask).forEach { call ->
                val slots = specs[call.resource] ?: return@forEach
                val where = "${file.relativeTo(root)}:${call.line} ${call.resource}"
                if (call.args.isEmpty()) return@forEach
                val declared = slots.keys.maxOrNull() ?: 0
                if (call.args.size != declared) {
                    problems += "$where declares $declared slot(s) but the call passes ${call.args.size}"
                }
                call.args.forEachIndexed { index, arg ->
                    val conversion = slots[index + 1] ?: return@forEachIndexed
                    if (conversion in NUMERIC_CONVERSIONS && isString(arg, locals)) {
                        problems += "$where slot ${index + 1} is %$conversion but the call passes a String: $arg"
                    }
                }
            }
        }

        assertTrue(
            problems.isEmpty(),
            "String resource format arguments don't match their slots:\n" + problems.joinToString("\n") { "  $it" },
        )
    }

    private data class CallSite(
        val resource: String,
        val args: List<String>,
        val line: Int,
    )

    private fun moduleRoot(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            if (File(dir, "src/androidMain/res/values/strings.xml").isFile) return dir
            dir = dir.parentFile
        }
        error("could not locate the androidApp module from ${File(".").absolutePath}")
    }

    /** name -> (1-based slot -> conversion character). */
    private fun formatSpecs(xml: String): Map<String, Map<Int, Char>> =
        STRING_ENTRY
            .findAll(xml)
            .associate { entry ->
                val body = entry.groupValues[2].replace("%%", "")
                var auto = 0
                val slots =
                    FORMAT_SPEC.findAll(body).associate { spec ->
                        val explicit = spec.groupValues[1]
                        val slot = if (explicit.isEmpty()) ++auto else explicit.toInt()
                        slot to spec.groupValues[2].first()
                    }
                entry.groupValues[1] to slots
            }

    /**
     * Marks the offsets that are real Kotlin code, so calls inside comments and string
     * literals are ignored — while `${...}` templates step back into code, because
     * FoodSleepCard nests a stringResource() call inside one.
     */
    private fun codeMask(source: String): BooleanArray {
        val mask = BooleanArray(source.length)
        val stack = ArrayDeque<IntArray>()
        stack.addLast(intArrayOf(CODE, 0))
        var i = 0
        while (i < source.length) {
            val context = stack.last()
            when (context[0]) {
                CODE ->
                    when {
                        source.startsWith("//", i) -> while (i < source.length && source[i] != '\n') i++
                        source.startsWith("/*", i) -> {
                            val end = source.indexOf("*/", i + 2)
                            i = if (end < 0) source.length else end + 2
                        }
                        source.startsWith("\"\"\"", i) -> {
                            stack.addLast(intArrayOf(RAW, 0))
                            i += 3
                        }
                        source[i] == '"' -> {
                            stack.addLast(intArrayOf(STRING, 0))
                            i++
                        }
                        source[i] == '\'' -> {
                            i++
                            while (i < source.length && source[i] != '\'') i += if (source[i] == '\\') 2 else 1
                            i++
                        }
                        source[i] == '{' && stack.size > 1 -> {
                            context[1]++
                            mask[i] = true
                            i++
                        }
                        source[i] == '}' && stack.size > 1 ->
                            if (context[1] == 0) {
                                stack.removeLast()
                                i++
                            } else {
                                context[1]--
                                mask[i] = true
                                i++
                            }
                        else -> {
                            mask[i] = true
                            i++
                        }
                    }
                STRING ->
                    when {
                        source[i] == '\\' -> i += 2
                        source[i] == '"' -> {
                            stack.removeLast()
                            i++
                        }
                        source.startsWith("\${", i) -> {
                            stack.addLast(intArrayOf(CODE, 0))
                            i += 2
                        }
                        else -> i++
                    }
                else ->
                    when {
                        source.startsWith("\"\"\"", i) -> {
                            stack.removeLast()
                            i += 3
                        }
                        source.startsWith("\${", i) -> {
                            stack.addLast(intArrayOf(CODE, 0))
                            i += 2
                        }
                        else -> i++
                    }
            }
        }
        return mask
    }

    private fun callSites(
        source: String,
        mask: BooleanArray,
    ): List<CallSite> =
        CALL
            .findAll(source)
            .filter { mask[it.range.first] }
            .filter { it.range.first == 0 || !source[it.range.first - 1].isLetterOrDigit() }
            .mapNotNull { match ->
                val args = splitArgs(source, mask, match.range.last) ?: return@mapNotNull null
                val resource = RESOURCE.matchEntire(args.firstOrNull().orEmpty()) ?: return@mapNotNull null
                CallSite(
                    resource = resource.groupValues[1],
                    args = args.drop(1),
                    line = source.take(match.range.first).count { it == '\n' } + 1,
                )
            }.toList()

    /** Top-level arguments of the call whose opening paren is at [openParen], or null if unbalanced. */
    private fun splitArgs(
        source: String,
        mask: BooleanArray,
        openParen: Int,
    ): List<String>? {
        val args = mutableListOf<String>()
        val current = StringBuilder()
        var depth = 1
        var i = openParen + 1
        while (i < source.length) {
            val c = source[i]
            if (!mask[i]) {
                current.append(c)
                i++
                continue
            }
            if (c in "([{") depth++
            if (c in ")]}") {
                depth--
                if (depth == 0) {
                    args += current.toString()
                    return args.map { it.trim() }.filter { it.isNotEmpty() }
                }
            }
            if (c == ',' && depth == 1) {
                args += current.toString()
                current.clear()
            } else {
                current.append(c)
            }
            i++
        }
        return null
    }

    private fun localVals(source: String): Map<String, String> =
        LOCAL_VAL.findAll(source).associate { it.groupValues[1] to it.groupValues[2] }

    private fun isString(
        expression: String,
        locals: Map<String, String>,
    ): Boolean {
        if (STRING_SHAPES.any { it.containsMatchIn(expression) }) return true
        if (!IDENTIFIER.matches(expression)) return false
        val bound = locals[expression] ?: return false
        return STRING_SHAPES.any { it.containsMatchIn(bound) }
    }

    private companion object {
        const val CODE = 0
        const val STRING = 1
        const val RAW = 2

        val NUMERIC_CONVERSIONS = setOf('d', 'f', 'x', 'o', 'e', 'g')
        val STRING_ENTRY = Regex("""<string name="([^"]+)">(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
        val FORMAT_SPEC = Regex("""%(?:(\d+)\$)?([a-zA-Z])""")
        val CALL = Regex("""(?:stringResource|getString)\(""")
        val RESOURCE = Regex("""R\.string\.(\w+)""")
        val IDENTIFIER = Regex("""\w+""")
        val LOCAL_VAL = Regex("""^\s*(?:val|var)\s+(\w+)\s*=\s*(\S.*?)\s*$""", RegexOption.MULTILINE)

        /** Expression shapes that are certainly Strings. Anything else is treated as unknown. */
        val STRING_SHAPES =
            listOf(
                Regex("""^""""),
                Regex("""\.formatAsInt\(\)$"""),
                Regex("""\.formatDecimal1\(\)$"""),
                Regex("""^formatDecimal1\("""),
                Regex("""\.toString\(\)$"""),
                Regex("""^stringResource\("""),
                Regex("""^String\.format\("""),
                Regex("""\.format\([^)]*\)$"""),
            )
    }
}
