package com.bissbilanz.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WearApp() }
        lifecycleScope.launch {
            // Render whatever last arrived, then ask the phone for a fresh push.
            WearStateRepository.loadCached(this@WearMainActivity)
            WearStateRepository.requestState(this@WearMainActivity)
        }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(this)
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
}
