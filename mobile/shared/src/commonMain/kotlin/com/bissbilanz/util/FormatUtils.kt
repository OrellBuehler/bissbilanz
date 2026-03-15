package com.bissbilanz.util

fun Double.toDisplayString(): String = if (this == toLong().toDouble()) toLong().toString() else toString()
