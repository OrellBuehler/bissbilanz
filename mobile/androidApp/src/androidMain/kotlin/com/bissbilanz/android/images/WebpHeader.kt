package com.bissbilanz.android.images

private const val WEBP_HEADER_BYTES = 30

/** Width and height from a webp header (lossy, lossless or extended), or null when it is none of them. */
internal fun webpDimensions(bytes: ByteArray): Pair<Int, Int>? {
    if (bytes.size < WEBP_HEADER_BYTES) return null

    fun u8(index: Int) = bytes[index].toInt() and 0xFF
    return when (String(bytes, 12, 4, Charsets.US_ASCII)) {
        "VP8 " -> {
            if (u8(23) != 0x9D || u8(24) != 0x01 || u8(25) != 0x2A) return null
            ((u8(26) or (u8(27) shl 8)) and 0x3FFF) to ((u8(28) or (u8(29) shl 8)) and 0x3FFF)
        }
        "VP8L" -> {
            if (u8(20) != 0x2F) return null
            val bits = u8(21) or (u8(22) shl 8) or (u8(23) shl 16) or (u8(24) shl 24)
            ((bits and 0x3FFF) + 1) to (((bits shr 14) and 0x3FFF) + 1)
        }
        "VP8X" -> {
            val width = 1 + (u8(24) or (u8(25) shl 8) or (u8(26) shl 16))
            val height = 1 + (u8(27) or (u8(28) shl 8) or (u8(29) shl 16))
            width to height
        }
        else -> null
    }
}
