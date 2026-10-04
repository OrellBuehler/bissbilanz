package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = ChoiceDropdownTest.TestApp::class)
class ChoiceDropdownTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsTheSelectedLabelAndReportsThePickedValue() {
        val picked = mutableListOf<Int>()
        composeTestRule.setContent {
            BissbilanzTheme {
                ChoiceDropdown(
                    selectedLabel = "Nicht gesetzt",
                    options = listOf("Nicht gesetzt" to 0, "Männlich" to 1, "Weiblich" to 2),
                    onSelect = { picked += it },
                )
            }
        }

        composeTestRule.onNodeWithText("Nicht gesetzt").performClick()
        composeTestRule.onNodeWithText("Weiblich").performClick()

        assertEquals(listOf(2), picked)
    }
}
