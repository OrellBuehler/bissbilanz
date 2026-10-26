package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.CallMerge
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.*
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.ErrorState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MergeConfirmDialog
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.viewmodels.FoodDuplicatesViewModel
import com.bissbilanz.android.ui.viewmodels.UiMessageSnackbar
import com.bissbilanz.model.FoodDuplicateFood
import com.bissbilanz.model.FoodDuplicateGroup
import com.bissbilanz.model.FoodDuplicateReason
import org.koin.androidx.compose.koinViewModel

/**
 * Candidate duplicate groups across the user's whole food database, mirroring the
 * web's `/foods/duplicates` page. Modelled after [FavoritesScreen]/[RemindersScreen]
 * for the pushed-screen scaffold, loading and empty states.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodDuplicatesScreen(navController: NavController) {
    val viewModel: FoodDuplicatesViewModel = koinViewModel()
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val isMerging by viewModel.isMerging.collectAsStateWithLifecycle()
    val loadFailed by viewModel.loadFailed.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    var resolvingGroup by remember { mutableStateOf<FoodDuplicateGroup?>(null) }
    var pendingMerge by remember { mutableStateOf<Pair<FoodDuplicateGroup, FoodDuplicateFood>?>(null) }

    UiMessageSnackbar(snackbarMessage, snackbarHostState, viewModel::clearSnackbar)

    resolvingGroup?.let { group ->
        GroupKeeperPickerDialog(
            group = group,
            onDismiss = { resolvingGroup = null },
            onSelected = { keeper ->
                resolvingGroup = null
                pendingMerge = group to keeper
            },
        )
    }

    pendingMerge?.let { (group, keeper) ->
        val sourceCount = group.foods.count { it.id != keeper.id }
        MergeConfirmDialog(
            message = stringResource(R.string.food_duplicates_merge_confirm_message, sourceCount, keeper.name),
            isSubmitting = isMerging,
            onConfirm = {
                viewModel.merge(group, keeper.id)
                pendingMerge = null
            },
            onDismiss = { pendingMerge = null },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.food_duplicates_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                viewModel.isLocalMode ->
                    EmptyState(
                        message = stringResource(R.string.food_merge_unavailable_offline),
                        icon = Icons.Outlined.CloudOff,
                    )
                isLoading -> LoadingScreen()
                loadFailed ->
                    ErrorState(
                        message = stringResource(R.string.food_duplicates_load_failed),
                        onRetry = { viewModel.load() },
                    )
                groups.isEmpty() ->
                    PullToRefreshWrapper(
                        onRefresh = { viewModel.load() },
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        // Scrollable, or the pull gesture has nothing to grab.
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            item {
                                Box(modifier = Modifier.fillParentMaxSize()) {
                                    EmptyState(
                                        message = stringResource(R.string.food_duplicates_empty),
                                        icon = Icons.Outlined.CheckCircle,
                                    )
                                }
                            }
                        }
                    }
                else ->
                    PullToRefreshWrapper(
                        onRefresh = { viewModel.load() },
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            item {
                                Text(
                                    stringResource(R.string.food_duplicates_description),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            items(groups, key = { it.reason.name + ":" + it.key }) { group ->
                                DuplicateGroupCard(
                                    group = group,
                                    enabled = !isMerging,
                                    onResolve = { resolvingGroup = group },
                                )
                            }
                        }
                    }
            }
        }
    }
}

@Composable
private fun DuplicateGroupCard(
    group: FoodDuplicateGroup,
    enabled: Boolean,
    onResolve: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                reasonLabel(group.reason),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            group.foods.forEach { food ->
                Text(
                    "${food.name}${food.brand?.let { " ($it)" } ?: ""}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(onClick = onResolve, enabled = enabled, contentPadding = ButtonDefaults.ButtonWithIconContentPadding) {
                    Icon(Icons.AutoMirrored.Filled.CallMerge, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                    Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                    Text(stringResource(R.string.food_duplicates_resolve))
                }
            }
        }
    }
}

/**
 * Lets the user pick which food in [group] to keep; the rest become merge sources.
 * The API supports any number of sources, so this works the same whether the group
 * has two foods or twenty — tapping a row immediately picks it as keeper and moves
 * to the confirmation step, the same one-tap-to-act pattern as the ingredient picker
 * in [com.bissbilanz.android.ui.components.RecipeEditSheet].
 */
@Composable
private fun GroupKeeperPickerDialog(
    group: FoodDuplicateGroup,
    onDismiss: () -> Unit,
    onSelected: (FoodDuplicateFood) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.food_merge_pick_keeper)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                group.foods.forEach { food ->
                    ListItem(
                        headlineContent = { Text(food.name) },
                        supportingContent = food.brand?.let { brand -> { Text(brand) } },
                        modifier = Modifier.clickable { onSelected(food) },
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

@Composable
private fun reasonLabel(reason: FoodDuplicateReason): String =
    when (reason) {
        FoodDuplicateReason.barcode -> stringResource(R.string.food_duplicates_reason_barcode)
        FoodDuplicateReason.name_brand -> stringResource(R.string.food_duplicates_reason_name_brand)
        FoodDuplicateReason.similar -> stringResource(R.string.food_duplicates_reason_similar)
    }
