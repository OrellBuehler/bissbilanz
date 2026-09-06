package com.bissbilanz.wear

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.launch

class WearMainActivity :
    ComponentActivity(),
    DataClient.OnDataChangedListener {
    private var pageRequest by mutableStateOf<WearPageRequest?>(null)
    private var requestCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyPageRequest(intent)
        setContent { WearApp(pageRequest) }
        lifecycleScope.launch {
            // Render whatever last arrived, then ask the phone for a fresh push.
            WearStateRepository.loadCached(this@WearMainActivity)
            WearStateRepository.requestState(this@WearMainActivity)
        }
    }

    /** The complication opens the log screen on an app that may already be running. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyPageRequest(intent)
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(this)
        // Opening the app is the one moment we know the user is watching, so it
        // is also the moment to get anything logged out of range on its way.
        lifecycleScope.launch { WearStateRepository.flushOutbox(this@WearMainActivity) }
    }

    override fun onPause() {
        super.onPause()
        Wearable.getDataClient(this).removeListener(this)
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            if (event.dataItem.uri.path != WearPaths.STATE) return@forEach
            DataMapItem
                .fromDataItem(event.dataItem)
                .dataMap
                .getString(WearPaths.KEY_PAYLOAD)
                ?.let { payload -> WearStateRepository.decode(payload)?.let(WearStateRepository::update) }
        }
    }

    private fun applyPageRequest(intent: Intent?) {
        val page =
            when (intent?.action) {
                ACTION_OPEN_LOG -> WearPages.LOG
                else -> return
            }
        requestCount += 1
        pageRequest = WearPageRequest(page = page, token = requestCount)
    }

    companion object {
        /** Complication tap target: open the app on its quick-log page. */
        const val ACTION_OPEN_LOG = "com.bissbilanz.wear.action.OPEN_LOG"
    }
}
