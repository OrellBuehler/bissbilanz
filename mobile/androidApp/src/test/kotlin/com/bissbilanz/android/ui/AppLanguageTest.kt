package com.bissbilanz.android.ui

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale
import kotlin.test.assertEquals

/**
 * The in-app language picker on API 26..32, where the platform has no per-app language
 * and `wrap` does the work by hand. `wrap` sets the process-wide default so number and
 * date parsing follow the picked language; the interesting case is switching back to
 * "System", which has to put the device locale back — leaving the last override in place
 * flipped the UI to English while `toLocalizedDoubleOrNull` kept parsing German commas
 * until the next cold start.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AppLanguageTest.TestApp::class)
class AppLanguageTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private lateinit var deviceDefault: Locale

    @Before
    fun setup() {
        deviceDefault = Locale.getDefault()
    }

    /** `wrap` mutates process-wide state, so put it back for the next test. */
    @After
    fun tearDown() {
        AppLanguage.apply(context, AppLanguage.SYSTEM)
        Locale.setDefault(deviceDefault)
    }

    @Test
    fun aPickedTagBecomesTheProcessAndResourceLocale() {
        AppLanguage.apply(context, "de")

        val wrapped = AppLanguage.wrap(context)

        assertEquals("de", Locale.getDefault().language)
        assertEquals(
            "de",
            wrapped.resources.configuration.locales[0]
                .language,
        )
    }

    @Test
    fun switchingBackToSystemRestoresTheDeviceLocale() {
        AppLanguage.apply(context, "de")
        AppLanguage.wrap(context)
        assertEquals("de", Locale.getDefault().language)

        AppLanguage.apply(context, AppLanguage.SYSTEM)
        AppLanguage.wrap(context)

        assertEquals(deviceDefault, Locale.getDefault())
    }

    @Test
    fun theSystemBranchLeavesTheContextAlone() {
        AppLanguage.apply(context, AppLanguage.SYSTEM)

        assertEquals(context, AppLanguage.wrap(context))
    }
}
