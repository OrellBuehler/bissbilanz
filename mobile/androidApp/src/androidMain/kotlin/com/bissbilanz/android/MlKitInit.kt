package com.bissbilanz.android

import android.content.Context
import com.bissbilanz.util.Failures
import com.google.mlkit.common.internal.CommonComponentRegistrar
import com.google.mlkit.common.sdkinternal.MlKitContext
import com.google.mlkit.vision.barcode.internal.BarcodeRegistrar
import com.google.mlkit.vision.common.internal.VisionCommonRegistrar
import com.google.mlkit.vision.text.internal.TextRegistrar

/**
 * Registers the ML Kit components explicitly instead of through ML Kit's own
 * `MlKitInitProvider`, which is removed from the manifest.
 *
 * The provider discovers registrars by reading meta-data off
 * `MlKitComponentDiscoveryService` and instantiating the named classes by
 * reflection, and it swallows every failure on that path with a `Log.w`. On
 * Android 11 devices (Play pre-launch crawlers, a LineageOS phone — Sentry
 * BISSBILANZ-25) that discovery came up empty: `BarcodeScanning.getClient()`
 * then dereferences a component that was never registered and the scanner
 * reports itself as unavailable. Passing the registrars as a list bypasses
 * discovery entirely, and a failure here surfaces as an exception instead of a
 * log line nobody reads.
 *
 * The list must match the registrars ML Kit's AARs would have declared in the
 * merged manifest; a missing one makes its feature fail at `getClient()`.
 */
object MlKitInit {
    fun initialize(context: Context) {
        try {
            MlKitContext.initialize(
                context,
                listOf(
                    CommonComponentRegistrar(),
                    VisionCommonRegistrar(),
                    BarcodeRegistrar(),
                    TextRegistrar(),
                ),
            )
        } catch (e: Exception) {
            // Without this the scanner and label OCR throw "MlKitContext has not been
            // initialized" at getClient(), which their screens already show and report.
            Failures.report(e)
        }
    }
}
