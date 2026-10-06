package com.bissbilanz.foodpackage

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import java.io.IOException
import java.io.Reader

/**
 * Walks the top-level object of a food-package manifest without ever holding it whole: the
 * keys may come in any order, every array element is handed over as its raw JSON text (or
 * just counted, or skipped) and the next one is read only afterwards, so memory stays at one
 * element no matter how many foods the file has.
 *
 * Written against plain `java.io` rather than `android.util.JsonReader` so the same code runs
 * in plain JVM unit tests.
 */
internal class ManifestScanner(
    private val input: Reader,
    private val maxChars: Long,
    private val maxElementChars: Int,
) {
    enum class Mode { SKIP, VALUE, ELEMENTS, COUNT }

    private val buffer = CharArray(BUFFER_SIZE)
    private var length = 0
    private var position = 0
    private var consumed = 0L

    private fun peek(): Int {
        if (position >= length) {
            val count =
                try {
                    input.read(buffer)
                } catch (e: IOException) {
                    throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The archive is damaged and cannot be read", e)
                }
            if (count <= 0) return -1
            length = count
            position = 0
            consumed += count
            if (consumed > maxChars) {
                throw FoodPackageException(FoodPackageException.Kind.TOO_LARGE, "The package manifest is too large")
            }
        }
        return buffer[position].code
    }

    private fun next(): Int {
        val c = peek()
        if (c >= 0) position++
        return c
    }

    private fun truncated(): Nothing = throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The package manifest is incomplete")

    private fun malformed(): Nothing =
        throw FoodPackageException(FoodPackageException.Kind.NOT_A_PACKAGE, "Unrecognized file: expected a Bissbilanz food package")

    private fun skipWhitespace() {
        while (true) {
            val c = peek()
            if (c < 0) return
            if (c == ' '.code || c == '\n'.code || c == '\r'.code || c == '\t'.code) position++ else return
        }
    }

    /**
     * Reads one JSON value, appending its raw text to [sink] when there is one. [sink] stops
     * growing past [maxElementChars]; the return value says whether the value fitted.
     */
    private fun readValue(sink: StringBuilder?): Boolean {
        skipWhitespace()
        var fits = true

        fun emit(c: Int) {
            if (sink == null) return
            if (sink.length >= maxElementChars) fits = false else sink.append(c.toChar())
        }
        val first = peek()
        when {
            first < 0 -> truncated()
            first == '"'.code -> {
                emit(next())
                readStringBody(::emit)
            }
            first == '{'.code || first == '['.code -> {
                var depth = 0
                while (true) {
                    val c = next()
                    if (c < 0) truncated()
                    emit(c)
                    when (c) {
                        '"'.code -> readStringBody(::emit)
                        '{'.code, '['.code -> depth++
                        '}'.code, ']'.code -> {
                            depth--
                            if (depth == 0) break
                        }
                    }
                }
            }
            else -> {
                while (true) {
                    val c = peek()
                    if (c < 0 || c == ','.code || c == '}'.code || c == ']'.code || c <= ' '.code) break
                    emit(next())
                }
            }
        }
        return fits
    }

    /** After the opening quote: through the closing one, honouring escapes. */
    private fun readStringBody(emit: (Int) -> Unit) {
        while (true) {
            val c = next()
            if (c < 0) truncated()
            emit(c)
            if (c == '\\'.code) {
                val escaped = next()
                if (escaped < 0) truncated()
                emit(escaped)
            } else if (c == '"'.code) {
                return
            }
        }
    }

    private fun parse(raw: String): JsonElement =
        try {
            parser.parseToJsonElement(raw)
        } catch (e: SerializationException) {
            throw FoodPackageException(FoodPackageException.Kind.INVALID, "Invalid food package: malformed JSON", e)
        }

    private fun readKey(): String {
        skipWhitespace()
        if (peek() != '"'.code) malformed()
        val raw = StringBuilder()
        raw.append(next().toChar())
        readStringBody { raw.append(it.toChar()) }
        return (parse(raw.toString()) as? JsonPrimitive)?.content ?: malformed()
    }

    /**
     * [onKey] decides per top-level key what to do with its value: [Mode.VALUE] parses it for
     * [onValue], [Mode.ELEMENTS] hands every array element to [onElement] (raw JSON, or null
     * when it was too long to keep), [Mode.COUNT] only reports the element count through
     * [onCount], [Mode.SKIP] discards it.
     */
    suspend fun walk(
        onKey: (String) -> Mode,
        onValue: (String, JsonElement) -> Unit = { _, _ -> },
        onElement: suspend (String, Int, String?) -> Unit = { _, _, _ -> },
        onCount: (String, Int) -> Unit = { _, _ -> },
    ) {
        skipWhitespace()
        if (peek() == BOM) position++
        skipWhitespace()
        if (next() != '{'.code) malformed()
        val context = currentCoroutineContext()
        var first = true
        while (true) {
            skipWhitespace()
            val c = peek()
            if (c < 0) truncated()
            if (c == '}'.code) {
                position++
                return
            }
            if (!first) {
                if (c != ','.code) malformed()
                position++
            }
            first = false
            val key = readKey()
            skipWhitespace()
            if (next() != ':'.code) malformed()
            skipWhitespace()
            val mode = onKey(key)
            if (peek() != '['.code || mode == Mode.SKIP || mode == Mode.VALUE) {
                if (mode == Mode.VALUE) {
                    val raw = StringBuilder()
                    if (!readValue(
                            raw,
                        )
                    ) {
                        throw FoodPackageException(FoodPackageException.Kind.TOO_LARGE, "The package manifest is too large")
                    }
                    onValue(key, parse(raw.toString()))
                } else {
                    readValue(null)
                }
                continue
            }
            position++
            var index = 0
            while (true) {
                context.ensureActive()
                skipWhitespace()
                val n = peek()
                if (n < 0) truncated()
                if (n == ']'.code) {
                    position++
                    break
                }
                if (index > 0) {
                    if (n != ','.code) malformed()
                    position++
                }
                if (mode == Mode.ELEMENTS) {
                    val raw = StringBuilder()
                    val fits = readValue(raw)
                    onElement(key, index, if (fits) raw.toString() else null)
                } else {
                    readValue(null)
                }
                index++
            }
            if (mode == Mode.COUNT) onCount(key, index)
        }
    }

    private companion object {
        const val BUFFER_SIZE = 64 * 1024
        const val BOM = 0xFEFF
        val parser = Json { isLenient = false }
    }
}
