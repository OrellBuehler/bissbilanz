package com.bissbilanz.android.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlinx.coroutines.launch

class MacroWidgetConfigActivity : ComponentActivity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setResult(RESULT_CANCELED)

        appWidgetId =
            intent?.extras?.getInt(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID,
            ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        setContent {
            BissbilanzTheme {
                var showCalories by remember { mutableStateOf(true) }
                var showProtein by remember { mutableStateOf(true) }
                var showCarbs by remember { mutableStateOf(true) }
                var showFat by remember { mutableStateOf(true) }
                var showFiber by remember { mutableStateOf(true) }
                val scope = rememberCoroutineScope()
                val context = this@MacroWidgetConfigActivity

                LaunchedEffect(Unit) {
                    try {
                        val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
                        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId)
                        showCalories = prefs[MacroWidget.ShowCaloriesKey] ?: true
                        showProtein = prefs[MacroWidget.ShowProteinKey] ?: true
                        showCarbs = prefs[MacroWidget.ShowCarbsKey] ?: true
                        showFat = prefs[MacroWidget.ShowFatKey] ?: true
                        showFiber = prefs[MacroWidget.ShowFiberKey] ?: true
                    } catch (_: Exception) {
                        // New widget, use defaults
                    }
                }

                Scaffold { padding ->
                    Column(
                        modifier =
                            Modifier
                                .fillMaxSize()
                                .padding(padding)
                                .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = "Configure Widget",
                            style = MaterialTheme.typography.headlineMedium,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Select which macros to display:",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(24.dp))

                        MacroCheckbox("Calories", showCalories, CaloriesBlue) { showCalories = it }
                        MacroCheckbox("Protein", showProtein, ProteinRed) { showProtein = it }
                        MacroCheckbox("Carbs", showCarbs, CarbsOrange) { showCarbs = it }
                        MacroCheckbox("Fat", showFat, FatYellow) { showFat = it }
                        MacroCheckbox("Fiber", showFiber, FiberGreen) { showFiber = it }

                        Spacer(modifier = Modifier.height(32.dp))

                        Button(
                            onClick = {
                                scope.launch {
                                    saveAndFinish(
                                        showCalories,
                                        showProtein,
                                        showCarbs,
                                        showFat,
                                        showFiber,
                                    )
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled =
                                showCalories || showProtein || showCarbs || showFat || showFiber,
                        ) {
                            Text("Save")
                        }
                    }
                }
            }
        }
    }

    private suspend fun saveAndFinish(
        showCalories: Boolean,
        showProtein: Boolean,
        showCarbs: Boolean,
        showFat: Boolean,
        showFiber: Boolean,
    ) {
        val glanceId = GlanceAppWidgetManager(this).getGlanceIdBy(appWidgetId)

        updateAppWidgetState(this, PreferencesGlanceStateDefinition, glanceId) { prefs ->
            prefs.toMutablePreferences().apply {
                this[MacroWidget.ShowCaloriesKey] = showCalories
                this[MacroWidget.ShowProteinKey] = showProtein
                this[MacroWidget.ShowCarbsKey] = showCarbs
                this[MacroWidget.ShowFatKey] = showFat
                this[MacroWidget.ShowFiberKey] = showFiber
            }
        }

        MacroWidget().update(this, glanceId)

        val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        setResult(RESULT_OK, result)
        finish()
    }
}

@androidx.compose.runtime.Composable
private fun MacroCheckbox(
    label: String,
    checked: Boolean,
    color: androidx.compose.ui.graphics.Color,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors =
                CheckboxDefaults.colors(
                    checkedColor = color,
                ),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = color,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}
