package com.bissbilanz.foodpackage

/**
 * The food-package format, mirroring `src/lib/server/food-package/format.ts` and
 * `filename.ts`. A package is a zip (or a bare JSON manifest) that Bissbilanz on the web,
 * Android and iOS all read and write, so every limit and naming rule here must stay in
 * step with the server.
 */
const val FOOD_PACKAGE_FORMAT = "bissbilanz.food-package"
const val FOOD_PACKAGE_VERSION = 1
const val MANIFEST_NAME = "bissbilanz-foods.json"
const val FOOD_PACKAGE_EXTENSION = ".bissbilanz"
const val FOOD_PACKAGE_MIME = "application/zip"

const val MAX_PACKAGE_BYTES = 200L * 1024 * 1024
const val MAX_EXPORT_BYTES = 50L * 1024 * 1024
const val MAX_PACKAGE_FOODS = 25000
const val MAX_PACKAGE_RECIPES = 1000
const val MAX_RECIPE_INGREDIENTS = 100
const val MAX_PACKAGE_RECIPE_STEPS = 50
const val MAX_MANIFEST_BYTES = 40L * 1024 * 1024
const val MAX_IMAGE_ENTRY_BYTES = 5L * 1024 * 1024
const val MAX_TOTAL_INFLATED_BYTES = 300L * 1024 * 1024
const val MAX_ZIP_ENTRIES = MAX_PACKAGE_FOODS + MAX_PACKAGE_RECIPES * (1 + MAX_PACKAGE_RECIPE_STEPS) + 16
const val MAX_PREVIEW_THUMBNAILS = 300
const val MAX_PREVIEW_SAMPLES = 50
const val MAX_ISSUES = 100

/** Only paths the exporter itself writes; anything else in the archive is never read. */
val IMAGE_PATH_REGEX = Regex("^images/[a-z0-9]+\\.(webp|jpe?g|png)$")

/** JS `\s`: Kotlin's [isWhitespace] plus the byte order mark. */
private fun Char.isJsSpace(): Boolean = isWhitespace() || this == '\uFEFF'

/** `trim()` plus collapsing every run of whitespace into one space. */
private fun collapseSpaces(value: String): String {
    val out = StringBuilder(value.length)
    var pendingSpace = false
    for (ch in value) {
        if (ch.isJsSpace()) {
            pendingSpace = out.isNotEmpty()
        } else {
            if (pendingSpace) out.append(' ')
            pendingSpace = false
            out.append(ch)
        }
    }
    return out.toString()
}

/** Lowercase letters with diacritics and their base letter, as `NFD` + stripping marks gives. */
private val DIACRITIC_PAIRS =
    (
        "àa áa âa ãa äa åa çc èe ée êe ëe ìi íi îi ïi ñn òo óo ôo õo öo ùu úu ûu üu ýy ÿy āa ăa ąa ćc ĉc ċc čc ďd " +
            "ēe ĕe ėe ęe ěe ĝg ğg ġg ģg ĥh ĩi īi ĭi įi ĵj ķk ĺl ļl ľl ńn ņn ňn ōo ŏo őo ŕr ŗr řr śs ŝs şs šs ţt ťt " +
            "ũu ūu ŭu ůu űu ųu ŵw ŷy źz żz žz ơo ưu ǎa ǐi ǒo ǔu ǖu ǘu ǚu ǜu ǟa ǡa ǣæ ǧg ǩk ǫo ǭo ǯʒ ǰj ǵg ǹn ǻa ǽæ " +
            "ǿø ȁa ȃa ȅe ȇe ȉi ȋi ȍo ȏo ȑr ȓr ȕu ȗu șs țt ȟh ȧa ȩe ȫo ȭo ȯo ȱo ȳy ḁa ḃb ḅb ḇb ḉc ḋd ḍd ḏd ḑd ḓd " +
            "ḕe ḗe ḙe ḛe ḝe ḟf ḡg ḣh ḥh ḧh ḩh ḫh ḭi ḯi ḱk ḳk ḵk ḷl ḹl ḻl ḽl ḿm ṁm ṃm ṅn ṇn ṉn ṋn ṍo ṏo ṑo ṓo ṕp " +
            "ṗp ṙr ṛr ṝr ṟr ṡs ṣs ṥs ṧs ṩs ṫt ṭt ṯt ṱt ṳu ṵu ṷu ṹu ṻu ṽv ṿv ẁw ẃw ẅw ẇw ẉw ẋx ẍx ẏy ẑz ẓz ẕz ẖh " +
            "ẗt ẘw ẙy ẛſ ạa ảa ấa ầa ẩa ẫa ậa ắa ằa ẳa ẵa ặa ẹe ẻe ẽe ếe ềe ểe ễe ệe ỉi ịi ọo ỏo ốo ồo ổo ỗo ộo ớo " +
            "ờo ởo ỡo ợo ụu ủu ứu ừu ửu ữu ựu ỳy ỵy ỷy ỹy"
    ).split(' ').associate { it[0] to it.substring(1) }

/** What `value.normalize('NFD').replace(/[̀-ͯ]/g, '')` does for the Latin text foods are named in. */
internal fun stripDiacritics(value: String): String {
    val out = StringBuilder(value.length)
    for (ch in value) {
        val base = DIACRITIC_PAIRS[ch]
        when {
            base != null -> out.append(base)
            ch in '\u0300'..'\u036F' -> Unit
            else -> out.append(ch)
        }
    }
    return out.toString()
}

/**
 * Mirrors `normalize` in `src/lib/server/food-duplicates.ts`: lowercase, trim, collapse
 * whitespace, strip diacritics. Punctuation is kept.
 */
fun normalizeName(value: String?): String {
    if (value.isNullOrEmpty()) return ""
    return stripDiacritics(collapseSpaces(value.lowercase()))
}

/** Identity used for "same food": name + brand, case/accent/whitespace-insensitive. */
fun foodKey(
    name: String,
    brand: String?,
): String = "${normalizeName(name)}\u0000${normalizeName(brand)}"

fun recipeKey(name: String): String = normalizeName(name)

fun trimBarcode(barcode: String?): String? = barcode?.trim()?.ifEmpty { null }

/** Same rule as the server's `allowedImageUrl` for URLs a package carries. */
private val ALLOWED_IMAGE_HOSTS = setOf("images.openfoodfacts.org", "images.openfoodfacts.net")

fun allowedImageUrl(imageUrl: String?): String? {
    if (imageUrl.isNullOrEmpty()) return null
    if (imageUrl.startsWith("/uploads/")) return imageUrl
    if (!imageUrl.startsWith("https://")) return null
    val host = imageUrl.removePrefix("https://").takeWhile { it != '/' && it != '?' && it != '#' }
    if (host.isEmpty() || '@' in host) return null
    val hostname = host.substringBefore(':').lowercase()
    return imageUrl.takeIf { hostname in ALLOWED_IMAGE_HOSTS }
}

/** An absolute public image URL from a package; never one of "our" relative paths. */
fun packageImageUrl(url: String?): String? = if (url != null && !url.startsWith("/")) allowedImageUrl(url) else null

// ── File names ────────────────────────────────────────────────────────────

private const val MAX_NAME_LENGTH = 80
private val WINDOWS_RESERVED = Regex("^(con|prn|aux|nul|com[0-9]|lpt[0-9])$", RegexOption.IGNORE_CASE)
private const val FORBIDDEN_CHARS = "/\\<>:\"|?*'`´‘’“”„"

private val TRANSLITERATION =
    mapOf(
        'ä' to "ae",
        'ö' to "oe",
        'ü' to "ue",
        'Ä' to "Ae",
        'Ö' to "Oe",
        'Ü' to "Ue",
        'ß' to "ss",
        'æ' to "ae",
        'Æ' to "AE",
        'œ' to "oe",
        'Œ' to "OE",
        'ø' to "o",
        'Ø' to "O",
        'đ' to "d",
        'Đ' to "D",
        'ł' to "l",
        'Ł' to "L",
    )

private fun Char.isControlOrFormat(): Boolean =
    when (category) {
        CharCategory.CONTROL,
        CharCategory.FORMAT,
        CharCategory.LINE_SEPARATOR,
        CharCategory.PARAGRAPH_SEPARATOR,
        -> true
        else -> false
    }

/** The first [count] code points; a surrogate pair is never cut in half. */
private fun takeCodePoints(
    value: String,
    count: Int,
): String {
    var points = 0
    var index = 0
    while (index < value.length && points < count) {
        index += if (value[index].isHighSurrogate() && index + 1 < value.length && value[index + 1].isLowSurrogate()) 2 else 1
        points++
    }
    return value.substring(0, index)
}

/** Make a food or recipe name safe as a file name on every OS; empty if nothing is left. */
fun sanitizeFilenameBase(name: String): String {
    val spaced =
        buildString(name.length) {
            for (ch in name) {
                append(if (ch.isControlOrFormat() || ch in FORBIDDEN_CHARS) ' ' else ch)
            }
        }
    val cleaned =
        takeCodePoints(collapseSpaces(spaced), MAX_NAME_LENGTH)
            .trim()
            // Windows drops trailing dots and spaces; a leading dot hides the file.
            .trim { it == '.' || it == ' ' }
    return if (WINDOWS_RESERVED.matches(cleaned)) "${cleaned}_" else cleaned
}

/** Plain-ASCII version for the legacy `filename="..."` parameter. */
fun asciiFilename(name: String): String {
    val transliterated =
        buildString(name.length) {
            for (ch in name) append(TRANSLITERATION[ch] ?: ch.toString())
        }
    val ascii =
        buildString(transliterated.length) {
            for (ch in stripDiacritics(transliterated)) {
                val allowed = ch in 'A'..'Z' || ch in 'a'..'z' || ch in '0'..'9' || ch in " ._()+,&@!#=~^-"
                append(if (allowed) ch else '_')
            }
        }
    return ascii.replace(Regex("_{2,}"), "_").trimStart('.', '_', ' ').trim()
}

/**
 * Name of the shared file: the recipe or food when the package is about exactly one of
 * them, otherwise a generic dated name. [today] is `YYYY-MM-DD`.
 */
fun packageFilename(
    recipes: List<String>,
    foods: List<String>,
    today: String,
): String {
    val single =
        when {
            recipes.size == 1 && foods.isEmpty() -> recipes[0]
            recipes.isEmpty() && foods.size == 1 -> foods[0]
            else -> null
        }
    val base = single?.let { sanitizeFilenameBase(it) }.orEmpty()
    return "${base.ifEmpty { "bissbilanz-foods-$today" }}$FOOD_PACKAGE_EXTENSION"
}

private const val GENERIC_PACKAGE_FILENAME = "bissbilanz-foods$FOOD_PACKAGE_EXTENSION"

private fun percentDecode(value: String): String? {
    val bytes = ArrayList<Byte>(value.length)
    var index = 0
    while (index < value.length) {
        val ch = value[index]
        if (ch == '%') {
            val code = value.substring(index + 1, minOf(index + 3, value.length)).toIntOrNull(16)
            if (code == null || index + 3 > value.length) return null
            bytes.add(code.toByte())
            index += 3
        } else {
            val end = value.indexOf('%', index).let { if (it < 0) value.length else it }
            value.substring(index, end).encodeToByteArray().forEach { bytes.add(it) }
            index = end
        }
    }
    // Invalid UTF-8 decodes to U+FFFD, which a real file name never holds.
    val text = bytes.toByteArray().decodeToString()
    return text.takeUnless { REPLACEMENT_CHAR in it }
}

private const val REPLACEMENT_CHAR = '\uFFFD'

/** Keep a plain file name: no folders, no control characters, nothing the OS refuses. */
private fun safeDownloadName(name: String): String =
    name
        .filterNot { it.category == CharCategory.CONTROL || it.category == CharCategory.FORMAT }
        .map { if (it in "/\\<>:\"|?*") '_' else it }
        .joinToString("")
        .trimStart('.', ' ')
        .trim()

/**
 * The file name a download response asks for: the RFC 5987 `filename*` first (UTF-8 names
 * such as "Käsespätzle"), then the plain `filename`, else [fallback]. Mirrors
 * `filenameFromContentDisposition` in the web's `foodPackage.ts`.
 */
fun filenameFromContentDisposition(
    header: String?,
    fallback: String = GENERIC_PACKAGE_FILENAME,
): String {
    if (header.isNullOrBlank()) return fallback
    val extended =
        Regex("filename\\*\\s*=\\s*([^;]+)", RegexOption.IGNORE_CASE)
            .find(header)
            ?.groupValues
            ?.get(1)
            ?.trim()
    if (extended != null) {
        val match = Regex("^utf-8'[^']*'(.*)$", RegexOption.IGNORE_CASE).find(extended)
        val decoded = match?.let { percentDecode(it.groupValues[1].trim('"')) }
        val name = decoded?.let { safeDownloadName(it) }.orEmpty()
        if (name.isNotEmpty()) return name
    }
    val plain = Regex("(?:^|[;\\s])filename\\s*=\\s*(?:\"((?:[^\"\\\\]|\\\\.)*)\"|([^;]+))", RegexOption.IGNORE_CASE).find(header)
    val raw =
        plain
            ?.groupValues
            ?.get(1)
            ?.takeIf { it.isNotEmpty() }
            ?.replace(Regex("\\\\(.)"), "$1")
            ?: plain?.groupValues?.get(2)?.trim()
    val name = raw?.let { safeDownloadName(it) }.orEmpty()
    return name.ifEmpty { fallback }
}
