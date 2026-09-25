package com.bissbilanz.android.tips

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = TipStoreTest.TestApp::class)
class TipStoreTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    // A fresh prefs slate per test: TipStore is SharedPreferences-backed and Robolectric
    // otherwise carries the file over between tests in the same class.
    private fun store(): TipStore {
        context
            .getSharedPreferences("bissbilanz_tips", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        return TipStore(context)
    }

    @Test
    fun aFreshTipIsNotDismissed() {
        val store = store()

        assertFalse(store.isDismissed(TipIds.SCANNING))
    }

    @Test
    fun dismissMarksTheTipAndPersistsAcrossInstances() {
        val store = store()

        store.dismiss(TipIds.SCANNING)

        assertTrue(store.isDismissed(TipIds.SCANNING))
        assertTrue(TipIds.SCANNING in store.dismissedIds.value)
        // A second instance reads the same SharedPreferences file.
        assertTrue(TipStore(context).isDismissed(TipIds.SCANNING))
    }

    @Test
    fun dismissingOneTipLeavesOthersUntouched() {
        val store = store()

        store.dismiss(TipIds.SCANNING)

        assertFalse(store.isDismissed(TipIds.FAVORITES))
    }

    @Test
    fun incrementFoodLoggedCountsUpAndPersists() {
        val store = store()

        store.incrementFoodLogged()
        store.incrementFoodLogged()

        assertEquals(2, store.foodLoggedCount.value)
        assertEquals(2, TipStore(context).foodLoggedCount.value)
    }

    @Test
    fun resetAllClearsDismissalsButKeepsTheFoodLoggedCount() {
        val store = store()
        store.dismiss(TipIds.SCANNING)
        store.dismiss(TipIds.WIDGETS)
        store.incrementFoodLogged()
        store.incrementFoodLogged()

        store.resetAll()

        assertFalse(store.isDismissed(TipIds.SCANNING))
        assertFalse(store.isDismissed(TipIds.WIDGETS))
        assertTrue(store.dismissedIds.value.isEmpty())
        assertEquals(2, store.foodLoggedCount.value)
    }
}
