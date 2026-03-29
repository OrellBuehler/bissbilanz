package com.bissbilanz.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ApiConnectivityTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesAndShowsDashboard() {
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Today").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
    }

    @Test
    fun dashboardDisplaysSeededEntries() {
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Calories").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }
        composeTestRule.onNodeWithText("Calories").assertIsDisplayed()
        composeTestRule.onNodeWithText("Protein").assertIsDisplayed()
        composeTestRule.onNodeWithText("Carbs").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fat").assertIsDisplayed()
    }
}
