package com.bissbilanz.android.wear

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A watch retry that reaches the phone twice must not produce two entries. The
 * watch cannot tell a lost answer from a lost request, so it re-sends by design —
 * this is the only thing standing between that and a double-logged dinner.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = WearAppliedRequestsTest.TestApp::class)
class WearAppliedRequestsTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `the same request is applied once`() {
        assertTrue(WearAppliedRequests.markApplied(context, "same-1"))
        assertFalse(WearAppliedRequests.markApplied(context, "same-1"))
    }

    @Test
    fun `different requests are all applied`() {
        assertTrue(WearAppliedRequests.markApplied(context, "diff-1"))
        assertTrue(WearAppliedRequests.markApplied(context, "diff-2"))
    }

    @Test
    fun `a request without an id is applied rather than dropped`() {
        // An older watch build sends none; refusing it would lose the user's log.
        assertTrue(WearAppliedRequests.markApplied(context, null))
        assertTrue(WearAppliedRequests.markApplied(context, null))
    }

    @Test
    fun `the remembered set stays bounded`() {
        assertTrue(WearAppliedRequests.markApplied(context, "bounded-oldest"))
        repeat(64) { index -> WearAppliedRequests.markApplied(context, "bounded-$index") }
        // Pushed out of the window, so it would be applied again — which is fine:
        // a retry that far behind is not a retry any more.
        assertTrue(WearAppliedRequests.markApplied(context, "bounded-oldest"))
        assertFalse(WearAppliedRequests.markApplied(context, "bounded-63"))
    }
}
