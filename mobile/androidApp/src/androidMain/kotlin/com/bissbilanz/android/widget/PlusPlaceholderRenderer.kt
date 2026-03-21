package com.bissbilanz.android.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF

object PlusPlaceholderRenderer {
    fun render(
        sizePx: Int,
        isDarkMode: Boolean,
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgColor = if (isDarkMode) 0xFF2A2A2A.toInt() else 0xFFF0F0F0.toInt()
        val iconColor = if (isDarkMode) 0xFF666666.toInt() else 0xFFBBBBBB.toInt()
        val cornerRadius = sizePx / 6f

        val bgPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = bgColor
                style = Paint.Style.FILL
            }
        canvas.drawRoundRect(
            RectF(0f, 0f, sizePx.toFloat(), sizePx.toFloat()),
            cornerRadius,
            cornerRadius,
            bgPaint,
        )

        val linePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = iconColor
                strokeWidth = sizePx * 0.08f
                strokeCap = Paint.Cap.ROUND
            }

        val center = sizePx / 2f
        val armLen = sizePx * 0.18f
        canvas.drawLine(center, center - armLen, center, center + armLen, linePaint)
        canvas.drawLine(center - armLen, center, center + armLen, center, linePaint)

        return bitmap
    }
}
