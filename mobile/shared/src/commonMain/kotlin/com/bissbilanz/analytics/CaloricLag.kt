package com.bissbilanz.analytics

data class LagResult(
    val lag: Int,
    val correlation: CorrelationResult?,
    /** Benjamini–Hochberg adjusted p across the lags tested; null when untested. */
    val qValue: Double?,
)

data class CaloricLagResult(
    /** The lag with the largest |r| among those significant after FDR control, else null. */
    val bestLag: Int?,
    /** Number of lags that had enough paired days to be tested. */
    val comparisons: Int,
    val results: List<LagResult>,
)

private const val MIN_PAIRS = 7
private const val FDR_LEVEL = 0.05

/**
 * How many days after a day's intake the scale moves. Correlates the day-over-
 * day *change* in weight with intake `lag` days earlier (two trending level
 * series correlate spuriously), and only reports a best lag that survives
 * Benjamini–Hochberg control across the lags searched.
 */
fun computeCaloricLag(
    dailyCalories: List<Pair<String, Double?>>,
    dailyWeight: List<Pair<String, Double?>>,
    maxLag: Int = 7,
): CaloricLagResult {
    val calorieMap = mutableMapOf<String, Double>()
    for ((date, value) in dailyCalories) {
        if (value != null) calorieMap[date] = value
    }
    val weightMap = mutableMapOf<String, Double>()
    for ((date, value) in dailyWeight) {
        if (value != null) weightMap[date] = value
    }
    val weightDeltas = LinkedHashMap<String, Double>()
    for ((date, weight) in weightMap) {
        val previous = weightMap[shiftDate(date, -1)] ?: continue
        weightDeltas[date] = weight - previous
    }

    val results = mutableListOf<LagResult>()
    for (lag in 1..maxLag) {
        val pairedCalories = mutableListOf<Double>()
        val pairedDeltas = mutableListOf<Double>()
        for ((date, delta) in weightDeltas) {
            val calories = calorieMap[shiftDate(date, -lag)] ?: continue
            pairedCalories.add(calories)
            pairedDeltas.add(delta)
        }
        if (pairedCalories.size < MIN_PAIRS) {
            results.add(LagResult(lag = lag, correlation = null, qValue = null))
        } else {
            results.add(
                LagResult(
                    lag = lag,
                    correlation = pearsonCorrelation(pairedCalories.toDoubleArray(), pairedDeltas.toDoubleArray()),
                    qValue = null,
                ),
            )
        }
    }

    val testedIdx = results.indices.filter { results[it].correlation != null }
    val qValues = benjaminiHochberg(testedIdx.map { results[it].correlation!!.pValue })
    testedIdx.forEachIndexed { i, idx -> results[idx] = results[idx].copy(qValue = qValues[i]) }

    var bestLag: Int? = null
    var bestAbsR = -1.0
    for (result in results) {
        val q = result.qValue ?: continue
        if (q > FDR_LEVEL) continue
        val absR = kotlin.math.abs(result.correlation!!.r)
        if (absR > bestAbsR) {
            bestAbsR = absR
            bestLag = result.lag
        }
    }
    return CaloricLagResult(bestLag = bestLag, comparisons = testedIdx.size, results = results)
}
