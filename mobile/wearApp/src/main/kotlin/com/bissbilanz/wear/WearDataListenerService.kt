package com.bissbilanz.wear

import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/** Receives the phone's state pushes while the watch app is not in the foreground. */
class WearDataListenerService : WearableListenerService() {
    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            if (event.dataItem.uri.path != WearPaths.STATE) return@forEach
            DataMapItem
                .fromDataItem(event.dataItem)
                .dataMap
                .getString(WearPaths.KEY_PAYLOAD)
                ?.let { payload ->
                    WearStateRepository.decode(payload)?.let(WearStateRepository::update)
                }
        }

        // A push is proof the phone is in range again, which is exactly when
        // anything logged out of range should go out.
        flushPending()
    }

    /**
     * The phone advertising its capability again is the cleanest "we are back in
     * range" signal there is — better than waiting for the user to open the app.
     * Inert until the phone build declares [WearPaths.PHONE_CAPABILITY]; the other
     * flush points cover that case.
     */
    override fun onCapabilityChanged(capabilityInfo: CapabilityInfo) {
        if (capabilityInfo.name != WearPaths.PHONE_CAPABILITY) return
        if (capabilityInfo.nodes.isEmpty()) return
        flushPending()
    }

    /**
     * Blocking is fine here: these callbacks already run on the service's own
     * background thread. Budgeted, so a long queue can't hold that thread
     * indefinitely — whatever is left goes out on the next push or app open.
     */
    private fun flushPending() {
        if (WearStateRepository.pendingCount(this) == 0) return
        runBlocking {
            withTimeoutOrNull(FLUSH_BUDGET_MS) { WearStateRepository.flushOutbox(this@WearDataListenerService) }
        }
    }

    private companion object {
        const val FLUSH_BUDGET_MS = 20_000L
    }
}
