package com.bissbilanz.android.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import kotlin.math.min
import kotlin.math.roundToInt

object MacroRingRenderer {
    fun render(
        current: Double,
        goal: Double,
        color: Int,
        label: String,
        ringPx: Int,
        density: Float,
        isDarkMode: Boolean,
    ): Bitmap {
        val strokePx = 5f * density
        val padding = strokePx / 2f + 2f * density
        val labelHeight = 12f * density
        val labelGap = 3f * density

        val bitmapWidth = ringPx + (padding * 2).toInt()
        val bitmapHeight = ringPx + (padding * 2 + labelGap + labelHeight).toInt()

        val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val rect = RectF(padding, padding, padding + ringPx, padding + ringPx)

        val bgPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = color
                alpha = 51
                style = Paint.Style.STROKE
                strokeWidth = strokePx
                strokeCap = Paint.Cap.ROUND
            }
        canvas.drawArc(rect, -90f, 360f, false, bgPaint)

        val progress = if (goal > 0) (current / goal).toFloat() else 0f
        if (progress > 0f) {
            val fgPaint =
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    this.color = color
                    if (progress > 1f) alpha = 153
                    style = Paint.Style.STROKE
                    strokeWidth = strokePx
                    strokeCap = Paint.Cap.ROUND
                }
            canvas.drawArc(rect, -90f, min(progress, 1f) * 360f, false, fgPaint)
        }

        val centerX = bitmapWidth / 2f
        val centerY = padding + ringPx / 2f
        val valuePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = color
                textSize = 11f * density
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
            }
        val textOffset = (valuePaint.descent() + valuePaint.ascent()) / 2f
        canvas.drawText(current.roundToInt().toString(), centerX, centerY - textOffset, valuePaint)

        val labelColor = if (isDarkMode) 0xFFAAAAAA.toInt() else 0xFF666666.toInt()
        val labelPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = labelColor
                textSize = 10f * density
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(label, centerX, (bitmapHeight - 2f * density), labelPaint)

        return bitmap
    }
}
