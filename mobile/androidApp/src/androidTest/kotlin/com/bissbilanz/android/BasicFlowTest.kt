package com.bissbilanz.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BasicFlowTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun navigateToPreviousDay() {
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Today").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }

        composeTestRule.onNodeWithContentDescription("Previous day").performClick()
        composeTestRule.onNodeWithText("Yesterday").assertIsDisplayed()
    }

    @Test
    fun navigateToNextDayAndBack() {
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Today").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }

        composeTestRule.onNodeWithContentDescription("Previous day").performClick()
        composeTestRule.onNodeWithText("Yesterday").assertIsDisplayed()

        composeTestRule.onNodeWithContentDescription("Next day").performClick()
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
    }
}
