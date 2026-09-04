package com.bissbilanz.util

const val MAX_LABELS_PER_FOOD = 20
private const val MAX_LABEL_LENGTH = 40
private const val MAX_LABEL_WORDS = 3

private val diacritics: Map<Char, Char> =
    mapOf(
        'à' to 'a',
        'á' to 'a',
        'â' to 'a',
        'ã' to 'a',
        'ä' to 'a',
        'å' to 'a',
        'ç' to 'c',
        'è' to 'e',
        'é' to 'e',
        'ê' to 'e',
        'ë' to 'e',
        'ì' to 'i',
        'í' to 'i',
        'î' to 'i',
        'ï' to 'i',
        'ñ' to 'n',
        'ò' to 'o',
        'ó' to 'o',
        'ô' to 'o',
        'õ' to 'o',
        'ö' to 'o',
        'ø' to 'o',
        'ù' to 'u',
        'ú' to 'u',
        'û' to 'u',
        'ü' to 'u',
        'ý' to 'y',
        'ÿ' to 'y',
    )

/**
 * Port of the server's `normalizeLabel` (src/lib/labels.ts). A search query is
 * folded through this before it is compared with a food's stored labels, so both
 * sides agree on the exact string — the server has already normalized what it
 * stored. Returns null for anything that cannot be an en_US noun label.
 */
fun normalizeLabel(raw: String): String? {
    val folded =
        buildString(raw.length) {
            for (ch in raw.lowercase()) append(diacritics[ch] ?: ch)
        }
    // A letter that is still not ASCII (ß, Cyrillic, CJK, …) can never match.
    if (folded.any { it.isLetter() && it !in 'a'..'z' }) return null

    val cleaned =
        folded
            .replace(Regex("['\u2018\u2019\u02bc]"), "")
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
            .replace(Regex("\\s+"), " ")
    if (cleaned.isEmpty()) return null

    val words = cleaned.split(' ')
    if (words.size > MAX_LABEL_WORDS) return null

    val singular = words.joinToString(" ") { singularize(it) }
    if (singular.isEmpty() || singular.length > MAX_LABEL_LENGTH) return null
    return singular
}

/** Deliberately crude, like the server: it only has to be consistent with it. */
private fun singularize(word: String): String {
    if (word.length <= 3) return word
    if (Regex("(ss|us|is)$").containsMatchIn(word)) return word
    if (word.endsWith("ies") && word.length > 4) return word.dropLast(3) + "y"
    if (Regex("(ches|shes|xes|zes|sses)$").containsMatchIn(word)) return word.dropLast(2)
    if (word.endsWith("oes")) return word.dropLast(2)
    if (word.endsWith("s")) return word.dropLast(1)
    return word
}

/** Normalize, drop rejects, dedupe, and cap at [MAX_LABELS_PER_FOOD]. */
fun normalizeLabels(raw: List<String>): List<String> {
    val seen = LinkedHashSet<String>()
    for (value in raw) {
        normalizeLabel(value)?.let { seen.add(it) }
        if (seen.size >= MAX_LABELS_PER_FOOD) break
    }
    return seen.toList()
}
