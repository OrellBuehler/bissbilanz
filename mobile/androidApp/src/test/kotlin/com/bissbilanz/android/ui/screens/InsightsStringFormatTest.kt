package com.bissbilanz.android.ui.screens

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.R
import com.bissbilanz.util.formatAsInt
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * MealBreakdownLegend feeds both slots of insights_meal_pct_format from
 * Double.formatAsInt(), which returns a String. The second slot was declared %2$d, so
 * Formatter threw IllegalFormatConversionException on every render and expanding the
 * Meal Breakdown card crashed the app (Sentry BISSBILANZ-2V).
 *
 * Lint's StringFormatMatches doesn't inspect Compose stringResource() calls, so nothing
 * else pins the resource's specifiers to the types the call site actually passes.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = InsightsStringFormatTest.TestApp::class)
class InsightsStringFormatTest {
    class TestApp : Application()

    private val context = ApplicationProvider.getApplicationContext<Application>()

    @Test
    fun mealPctFormatAcceptsTheStringsTheLegendPasses() {
        assertEquals(
            "512 kcal (26%)",
            context.getString(R.string.insights_meal_pct_format, 511.6.formatAsInt(), 25.5.formatAsInt()),
        )
    }

    @Test
    @Config(qualifiers = "de")
    fun mealPctFormatAcceptsTheStringsTheLegendPassesInGerman() {
        assertEquals(
            "512 kcal (26%)",
            context.getString(R.string.insights_meal_pct_format, 511.6.formatAsInt(), 25.5.formatAsInt()),
        )
    }
}
