package com.bissbilanz.analytics

fun movingAverage(
    series: List<Double?>,
    windowSize: Int,
): List<Double?> {
    val result = MutableList<Double?>(series.size) { null }
    for (i in windowSize - 1 until series.size) {
        val window = series.subList(i - windowSize + 1, i + 1)
        val values = window.filterNotNull()
        result[i] = if (values.isEmpty()) null else values.sum() / values.size
    }
    return result
}
