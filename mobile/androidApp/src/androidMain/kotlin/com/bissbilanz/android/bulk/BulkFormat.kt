package com.bissbilanz.android.bulk

import java.text.NumberFormat

/** A count with the thousands separator of the user's language, for "12,340 / 48,000 foods". */
fun formatCount(count: Number): String = NumberFormat.getIntegerInstance().format(count)
