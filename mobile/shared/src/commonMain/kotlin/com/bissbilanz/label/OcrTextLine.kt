package com.bissbilanz.label

/**
 * A normalized rectangle using the Vision convention: origin bottom-left, all
 * coordinates in 0...1. Keeping the same convention as the iOS implementation
 * means the row-clustering logic and its unit tests are identical across
 * platforms; the Android OCR frontend converts ML Kit's top-left pixel
 * rectangles into this space before handing lines to the parser.
 */
data class BoundingBox(
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
) {
    val minX: Double get() = x
    val midY: Double get() = y + height / 2
}

/**
 * A single line of recognized text with its normalized bounding box. Produced by
 * the platform OCR frontend and consumed by the parser's row clustering.
 */
data class OcrTextLine(
    val text: String,
    val boundingBox: BoundingBox,
)
