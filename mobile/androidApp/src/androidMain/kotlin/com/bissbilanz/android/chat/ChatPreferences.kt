package com.bissbilanz.android.chat

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Device-local state of the assistant chat: whether the first-use privacy notice was acknowledged. */
class ChatPreferences(
    context: Context,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _noticeSeen = MutableStateFlow(prefs.getBoolean(KEY_NOTICE_SEEN, false))
    val noticeSeen: StateFlow<Boolean> = _noticeSeen.asStateFlow()

    fun markNoticeSeen() {
        prefs.edit().putBoolean(KEY_NOTICE_SEEN, true).apply()
        _noticeSeen.value = true
    }

    companion object {
        const val PREFS_NAME = "assistant_chat"
        private const val KEY_NOTICE_SEEN = "privacy_notice_seen"
    }
}
