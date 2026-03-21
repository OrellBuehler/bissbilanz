package com.bissbilanz.android.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF

object CheckmarkRenderer {
    fun render(sizePx: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgColor = 0xFF2E7D32.toInt()
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

        val checkPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xFFFFFFFF.toInt()
                style = Paint.Style.STROKE
                strokeWidth = sizePx * 0.1f
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
            }

        val cx = sizePx / 2f
        val cy = sizePx / 2f
        val arm = sizePx * 0.2f

        val path = Path()
        path.moveTo(cx - arm, cy)
        path.lineTo(cx - arm * 0.2f, cy + arm * 0.7f)
        path.lineTo(cx + arm, cy - arm * 0.6f)
        canvas.drawPath(path, checkPaint)

        return bitmap
    }
}
