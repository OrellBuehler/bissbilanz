package com.bissbilanz.android.ui.screens

import android.content.SharedPreferences
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CheckboxRow

@Composable
internal fun SettingsNavigationCard(
    navController: NavController,
    selectedTabs: Set<String>,
    isLocalMode: Boolean,
    healthAvailable: Boolean,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column {
            SettingsNavItem(stringResource(R.string.weight_screen_title), Icons.Default.MonitorWeight) {
                if ("weight" in selectedTabs) {
                    navController.navigate("weight") {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                } else {
                    navController.navigate("weight")
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.chart_supplements), Icons.Default.Medication) {
                if ("supplements" in selectedTabs) {
                    navController.navigate("supplements") {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                } else {
                    navController.navigate("supplements")
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.sleep_section_title), Icons.Default.Bedtime) {
                navController.navigate("sleep")
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.fasting_title), Icons.Default.Timer) {
                navController.navigate("fasting")
            }
            if (healthAvailable) {
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.health_connect_title), Icons.Default.Favorite) {
                    navController.navigate("health")
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.recipe_list_title), Icons.AutoMirrored.Filled.MenuBook) {
                navController.navigate("recipes")
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.recipe_suggestions_title), Icons.Default.Lightbulb) {
                if ("recipe-suggestions" in selectedTabs) {
                    navController.navigate("recipe-suggestions") {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                } else {
                    navController.navigate("recipe-suggestions")
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.settings_nav_calendar), Icons.Default.CalendarMonth) {
                navController.navigate("calendar")
            }
            if (!isLocalMode) {
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.maintenance_title), Icons.Default.Calculate) {
                    navController.navigate("maintenance")
                }
                // The queue only exists server-side — the assistant reaches it
                // over MCP — so it has no meaning in Local mode.
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.ai_tasks_title), Icons.Default.AutoAwesome) {
                    navController.navigate("ai-tasks")
                }
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.connect_claude_title), Icons.Default.SmartToy) {
                    navController.navigate("connect-claude")
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.settings_nav_insights), Icons.Default.BarChart) {
                if ("insights" in selectedTabs) {
                    navController.navigate("insights") {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                } else {
                    navController.navigate("insights")
                }
            }
        }
    }
}

@Composable
internal fun NavigationTabsCard(
    selectedTabs: Set<String>,
    onSelectedTabsChange: (Set<String>) -> Unit,
    tabPrefs: SharedPreferences,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_nav_tabs),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_nav_tabs_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))

            val tabOptions =
                listOf(
                    "foods" to stringResource(R.string.settings_tab_foods),
                    "favorites" to stringResource(R.string.favorites_title),
                    "insights" to stringResource(R.string.settings_nav_insights),
                    "weight" to stringResource(R.string.weight_widget_title),
                    "supplements" to stringResource(R.string.chart_supplements),
                    "recipe-suggestions" to stringResource(R.string.recipe_suggestions_title),
                )

            tabOptions.forEach { (route, label) ->
                val isSelected = route in selectedTabs
                CheckboxRow(
                    label = label,
                    checked = isSelected,
                    enabled = if (isSelected) selectedTabs.size >= 3 else selectedTabs.size < 3,
                    onCheckedChange = { checked ->
                        val updated = if (checked) selectedTabs + route else selectedTabs - route
                        if (updated.size in 1..5) {
                            onSelectedTabsChange(updated)
                            if (updated.size == 3) {
                                tabPrefs.edit().putStringSet("selected_tabs", updated).apply()
                            }
                        }
                    },
                )
            }
            if (selectedTabs.size != 3) {
                Text(
                    stringResource(R.string.settings_select_exactly_3_tabs, selectedTabs.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
fun SettingsNavItem(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        headlineContent = { Text(title) },
        // Both icons only restate the row's own label, so they stay decorative
        // rather than making TalkBack announce every row three times.
        leadingContent = { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) },
        trailingContent = {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
