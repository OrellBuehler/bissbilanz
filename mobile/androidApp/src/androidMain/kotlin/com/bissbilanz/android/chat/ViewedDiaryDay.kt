package com.bissbilanz.android.chat

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The diary day the user last had open (the dashboard's day or a day log), so the assistant
 * chat can tell the server which day "this" refers to. Null until a diary screen showed one.
 */
class ViewedDiaryDay {
    private val _date = MutableStateFlow<String?>(null)
    val date: StateFlow<String?> = _date.asStateFlow()

    fun viewing(date: String) {
        _date.value = date
    }
}
