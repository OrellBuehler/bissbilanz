package com.bissbilanz.android.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface

object FavoritePlaceholderRenderer {
    fun render(name: String, sizePx: Int, isDarkMode: Boolean): Bitmap {
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgColor = if (isDarkMode) 0xFF3A3A3A.toInt() else 0xFFE0E0E0.toInt()
        val textColor = if (isDarkMode) 0xFFAAAAAA.toInt() else 0xFF666666.toInt()
        val cornerRadius = sizePx / 6f

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = bgColor
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(RectF(0f, 0f, sizePx.toFloat(), sizePx.toFloat()), cornerRadius, cornerRadius, bgPaint)

        val initial = name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = textColor
            textSize = sizePx * 0.4f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textAlign = Paint.Align.CENTER
        }

        val textBounds = android.graphics.Rect()
        textPaint.getTextBounds(initial, 0, initial.length, textBounds)
        val x = sizePx / 2f
        val y = sizePx / 2f - textBounds.exactCenterY()
        canvas.drawText(initial, x, y, textPaint)

        return bitmap
    }
}
