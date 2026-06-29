package com.bissbilanz.android.ocr

import android.graphics.Bitmap
import com.bissbilanz.label.BoundingBox
import com.bissbilanz.label.NutritionLabelParser
import com.bissbilanz.label.OcrTextLine
import com.bissbilanz.label.ParsedNutrition
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Runs on-device ML Kit text recognition over a nutrition-facts image and hands
 * the recognized lines to the shared [NutritionLabelParser]. No network, no
 * permission beyond camera. This is the Android counterpart of the iOS
 * `NutritionLabelScanner` (Apple Vision); both feed the same parser so the two
 * apps extract the same values.
 */
class NutritionLabelScanner {
    /** [bitmap] must be upright (EXIF orientation already applied). */
    suspend fun scan(bitmap: Bitmap): ParsedNutrition {
        val text = recognizeText(bitmap)
        return NutritionLabelParser.parse(toOcrLines(text, bitmap.width, bitmap.height))
    }

    private suspend fun recognizeText(bitmap: Bitmap): Text =
        suspendCancellableCoroutine { continuation ->
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            recognizer
                .process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { continuation.resume(it) }
                .addOnFailureListener { continuation.resumeWithException(it) }
                .addOnCompleteListener { recognizer.close() }
        }

    /**
     * Converts ML Kit lines (axis-aligned boxes in image pixels, origin
     * top-left) into the parser's normalized Vision convention (origin
     * bottom-left, 0...1) so the shared row-clustering logic behaves identically
     * to iOS.
     */
    private fun toOcrLines(
        text: Text,
        imageWidth: Int,
        imageHeight: Int,
    ): List<OcrTextLine> {
        if (imageWidth <= 0 || imageHeight <= 0) return emptyList()
        val width = imageWidth.toDouble()
        val height = imageHeight.toDouble()
        val lines = mutableListOf<OcrTextLine>()
        for (block in text.textBlocks) {
            for (line in block.lines) {
                val box = line.boundingBox ?: continue
                lines.add(
                    OcrTextLine(
                        text = line.text,
                        boundingBox =
                            BoundingBox(
                                x = box.left / width,
                                y = 1.0 - (box.bottom / height),
                                width = box.width() / width,
                                height = box.height() / height,
                            ),
                    ),
                )
            }
        }
        return lines
    }
}
