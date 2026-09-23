package com.bissbilanz.android.ui.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.android.util.DashboardSection
import com.bissbilanz.android.util.applyDashboardReorder
import com.bissbilanz.android.util.dashboardSectionOrder
import com.bissbilanz.android.util.isVisible
import com.bissbilanz.android.util.visibilityUpdate
import com.bissbilanz.model.PreferencesUpdate
import org.koin.androidx.compose.koinViewModel
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun DashboardLayoutScreen(navController: NavController) {
    val viewModel: SettingsViewModel = koinViewModel()
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val haptic = rememberHaptic()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.dashboard_layout_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        val p = prefs
        if (p == null) {
            LoadingScreen()
        } else {
            var sections by remember(p.widgetOrder) { mutableStateOf(dashboardSectionOrder(p.widgetOrder)) }
            val lazyListState = rememberLazyListState()
            val reorderableState =
                rememberReorderableLazyListState(lazyListState) { from, to ->
                    sections =
                        sections.toMutableList().apply {
                            add(to.index, removeAt(from.index))
                        }
                }

            LazyColumn(
                state = lazyListState,
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                items(sections, key = { it.key }) { section ->
                    ReorderableItem(reorderableState, key = section.key) { isDragging ->
                        val elevation by animateDpAsState(if (isDragging) 4.dp else 0.dp, label = "dashboardRowElevation")
                        Surface(shadowElevation = elevation) {
                            ListItem(
                                headlineContent = { Text(section.title()) },
                                supportingContent = { Text(section.description()) },
                                leadingContent = {
                                    IconButton(
                                        onClick = {},
                                        modifier =
                                            Modifier.draggableHandle(
                                                onDragStarted = {
                                                    haptic(HapticFeedbackType.GestureThresholdActivate)
                                                },
                                                onDragStopped = {
                                                    haptic(HapticFeedbackType.GestureEnd)
                                                    viewModel.updatePreference(
                                                        PreferencesUpdate(
                                                            widgetOrder = applyDashboardReorder(p.widgetOrder, sections),
                                                        ),
                                                    )
                                                },
                                            ),
                                    ) {
                                        Icon(Icons.Default.DragHandle, stringResource(R.string.dashboard_layout_drag_handle))
                                    }
                                },
                                trailingContent =
                                    if (section == DashboardSection.DAYLOG) {
                                        null
                                    } else {
                                        {
                                            Switch(
                                                checked = section.isVisible(p),
                                                onCheckedChange = { value ->
                                                    haptic(HapticFeedbackType.LongPress)
                                                    section.visibilityUpdate(value)?.let { viewModel.updatePreference(it) }
                                                },
                                            )
                                        }
                                    },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardSection.title(): String =
    stringResource(
        when (this) {
            DashboardSection.FASTING -> R.string.fasting_title
            DashboardSection.DAY_PROPERTIES -> R.string.settings_widget_day_properties
            DashboardSection.CHART -> R.string.dashboard_calorie_trend_title
            DashboardSection.FAVORITES -> R.string.favorites_title
            DashboardSection.RECIPE_SUGGESTIONS -> R.string.recipe_suggestions_title
            DashboardSection.SUPPLEMENTS -> R.string.chart_supplements
            DashboardSection.WEIGHT -> R.string.weight_widget_title
            DashboardSection.MEAL_BREAKDOWN -> R.string.settings_widget_meal_breakdown
            DashboardSection.TOP_FOODS -> R.string.settings_widget_top_foods
            DashboardSection.SLEEP -> R.string.sleep_section_title
            DashboardSection.DAYLOG -> R.string.dashboard_layout_row_daylog
        },
    )

@Composable
private fun DashboardSection.description(): String =
    stringResource(
        when (this) {
            DashboardSection.FASTING -> R.string.settings_widget_fasting_desc
            DashboardSection.DAY_PROPERTIES -> R.string.settings_widget_day_properties_desc
            DashboardSection.CHART -> R.string.dashboard_calorie_trend_desc
            DashboardSection.FAVORITES -> R.string.settings_widget_favorites_desc
            DashboardSection.RECIPE_SUGGESTIONS -> R.string.settings_widget_recipe_suggestions_desc
            DashboardSection.SUPPLEMENTS -> R.string.settings_widget_supplements_desc
            DashboardSection.WEIGHT -> R.string.settings_widget_weight_desc
            DashboardSection.MEAL_BREAKDOWN -> R.string.settings_widget_meal_breakdown_desc
            DashboardSection.TOP_FOODS -> R.string.settings_widget_top_foods_desc
            DashboardSection.SLEEP -> R.string.settings_widget_sleep_desc
            DashboardSection.DAYLOG -> R.string.dashboard_layout_row_daylog_desc
        },
    )
