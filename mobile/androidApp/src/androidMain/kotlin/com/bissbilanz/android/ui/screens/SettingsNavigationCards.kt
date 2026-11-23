package com.bissbilanz.android.ui.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.NavTabs
import com.bissbilanz.android.navigation.openDestination
import com.bissbilanz.android.navigation.tabScreen
import com.bissbilanz.android.ui.components.AppCard
import com.bissbilanz.android.ui.components.AppCardDefaults
import com.bissbilanz.android.ui.components.ChoiceDropdown
import com.bissbilanz.android.ui.theme.rememberHaptic
import sh.calvin.reorderable.ReorderableColumn

@Composable
internal fun SettingsNavigationCard(
    navController: NavController,
    barRoutes: List<String>,
    isLocalMode: Boolean,
    healthAvailable: Boolean,
) {
    // Every destination that can leave the bar has a row here, whatever the tab choice.
    fun open(route: String) = navController.openDestination(route, barRoutes)

    AppCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SettingsNavItem(stringResource(R.string.food_search_title), Icons.Default.Restaurant) { open("foods") }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.favorites_title), Icons.Default.Star) { open("favorites") }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.weight_screen_title), Icons.Default.MonitorWeight) { open("weight") }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.chart_supplements), Icons.Default.Medication) { open("supplements") }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.sleep_section_title), Icons.Default.Bedtime) { open("sleep") }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.fasting_title), Icons.Default.Timer) { open("fasting") }
            if (healthAvailable) {
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.health_connect_title), Icons.Default.Favorite) {
                    navController.navigate("health") { launchSingleTop = true }
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.recipe_list_title), Icons.AutoMirrored.Filled.MenuBook) { open("recipes") }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.recipe_suggestions_title), Icons.Default.Lightbulb) {
                open("recipe-suggestions")
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.settings_nav_calendar), Icons.Default.CalendarMonth) { open("calendar") }
            if (!isLocalMode) {
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.maintenance_title), Icons.Default.Calculate) {
                    navController.navigate("maintenance") { launchSingleTop = true }
                }
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.enhance_foods_title), Icons.Default.AutoFixHigh) {
                    navController.navigate("enhance-foods") { launchSingleTop = true }
                }
                // The queue only exists server-side — the assistant reaches it
                // over MCP — so it has no meaning in Local mode.
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.ai_tasks_title), Icons.Default.AutoAwesome) { open("ai-tasks") }
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.chat_title), Icons.AutoMirrored.Filled.Chat) { open("chat") }
                HorizontalDivider()
                SettingsNavItem(stringResource(R.string.connect_assistant_title), Icons.Default.SmartToy) {
                    navController.navigate("connect-claude") { launchSingleTop = true }
                }
            }
            HorizontalDivider()
            SettingsNavItem(stringResource(R.string.settings_nav_insights), Icons.Default.BarChart) { open("insights") }
        }
    }
}

/**
 * The bottom bar editor: the chosen tabs (reorderable, removable), every other destination
 * that could be one, and the tab the app opens on. All of it is device-local.
 */
@Composable
internal fun NavigationTabsCard(
    tabs: List<String>,
    landing: String?,
    signedIn: Boolean,
    onTabsChange: (List<String>) -> Unit,
    onLandingChange: (String) -> Unit,
) {
    val haptic = rememberHaptic()
    AppCard(modifier = Modifier.fillMaxWidth()) {
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

            NavTabsSectionLabel(stringResource(R.string.settings_nav_tabs_chosen))
            val moveUpLabel = stringResource(R.string.settings_nav_tabs_move_up)
            val moveDownLabel = stringResource(R.string.settings_nav_tabs_move_down)
            ReorderableColumn(
                list = tabs,
                onSettle = { from, to -> onTabsChange(NavTabs.move(tabs, from, to)) },
                onMove = { haptic(HapticFeedbackType.SegmentFrequentTick) },
            ) { index, id, isDragging ->
                key(id) {
                    ReorderableItem {
                        val screen = tabScreen(id)
                        val label = stringResource(screen.titleRes)
                        val elevation by animateDpAsState(if (isDragging) 4.dp else 0.dp, label = "navTabElevation")
                        val dragHandle =
                            Modifier.draggableHandle(
                                onDragStarted = { haptic(HapticFeedbackType.GestureThresholdActivate) },
                                onDragStopped = { haptic(HapticFeedbackType.GestureEnd) },
                            )
                        Surface(color = AppCardDefaults.colors().containerColor, shadowElevation = elevation) {
                            NavTabRow(
                                screenIcon = screen.icon,
                                label = label,
                                hint =
                                    if (NavTabs.isAllowed(id, signedIn)) null else stringResource(R.string.settings_nav_tabs_after_sign_in),
                                modifier =
                                    Modifier.semantics {
                                        customActions =
                                            listOfNotNull(
                                                CustomAccessibilityAction(moveUpLabel) {
                                                    onTabsChange(NavTabs.move(tabs, index, index - 1))
                                                    true
                                                }.takeIf { index > 0 },
                                                CustomAccessibilityAction(moveDownLabel) {
                                                    onTabsChange(NavTabs.move(tabs, index, index + 1))
                                                    true
                                                }.takeIf { index < tabs.lastIndex },
                                            )
                                    },
                            ) {
                                IconButton(
                                    onClick = {
                                        haptic(HapticFeedbackType.LongPress)
                                        onTabsChange(NavTabs.remove(tabs, id, signedIn))
                                    },
                                    enabled = NavTabs.canRemove(tabs, id, signedIn),
                                ) {
                                    Icon(
                                        Icons.Outlined.RemoveCircleOutline,
                                        stringResource(R.string.settings_nav_tabs_remove, label),
                                    )
                                }
                                // Touch only: TalkBack reorders through the row's Move up/down actions.
                                Box(
                                    modifier = dragHandle.minimumInteractiveComponentSize(),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(Icons.Default.DragHandle, contentDescription = null)
                                }
                            }
                        }
                    }
                }
            }

            val available = NavTabs.CANDIDATES - tabs.toSet()
            if (available.isNotEmpty()) {
                NavTabsSectionLabel(stringResource(R.string.settings_nav_tabs_available))
                if (tabs.size >= NavTabs.MAX) {
                    Text(
                        stringResource(R.string.settings_nav_tabs_full, NavTabs.MAX),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                available.forEach { id ->
                    val screen = tabScreen(id)
                    val label = stringResource(screen.titleRes)
                    NavTabRow(
                        screenIcon = screen.icon,
                        label = label,
                        hint = if (NavTabs.isAllowed(id, signedIn)) null else stringResource(R.string.settings_nav_tabs_requires_sign_in),
                    ) {
                        IconButton(
                            onClick = {
                                haptic(HapticFeedbackType.LongPress)
                                onTabsChange(NavTabs.add(tabs, id, signedIn))
                            },
                            enabled = NavTabs.canAdd(tabs, id, signedIn),
                        ) {
                            Icon(Icons.Outlined.AddCircleOutline, stringResource(R.string.settings_nav_tabs_add, label))
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            val visible = NavTabs.visible(tabs, signedIn)
            val landingOptions =
                listOf(stringResource(R.string.nav_home) to NavTabs.HOME) +
                    visible.map { stringResource(tabScreen(it).titleRes) to it }
            val selectedLanding = NavTabs.landingTab(landing, visible)
            ChoiceDropdown(
                selectedLabel = landingOptions.first { it.second == selectedLanding }.first,
                options = landingOptions,
                onSelect = onLandingChange,
                label = stringResource(R.string.settings_landing_tab),
            )
        }
    }
}

@Composable
private fun NavTabsSectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun NavTabRow(
    screenIcon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    hint: String?,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit,
) {
    val dimmed = hint != null
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        leadingContent = {
            Icon(
                screenIcon,
                null,
                tint = if (dimmed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
            )
        },
        // Wrapped and hyphenated: next to two 48dp buttons a German label such as
        // "Nahrungsergänzungsmittel" does not fit one line on a ~411dp phone.
        headlineContent = {
            Text(
                label,
                color = if (dimmed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                style = LocalTextStyle.current.copy(hyphens = Hyphens.Auto),
            )
        },
        supportingContent = hint?.let { { Text(it, style = LocalTextStyle.current.copy(hyphens = Hyphens.Auto)) } },
        trailingContent = { Row(verticalAlignment = Alignment.CenterVertically, content = actions) },
        modifier = modifier,
    )
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
