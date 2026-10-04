package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.FoodListItem
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.model.Food
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.koin.androidx.compose.koinViewModel

private const val PICKER_VIEW_MODEL_KEY = "food-picker"

/**
 * The one place a food is picked: a full-height sheet with All / Recent / Favorites
 * tabs over the same search data the Foods tab uses. [excludeIds] and [foodFilter]
 * narrow what can be chosen (a merge cannot keep the food being merged away; a food
 * package mapping needs a compatible unit). [allowOpenFoodFacts] adds Open Food
 * Facts hits to the search; picking one first copies it into the user's own foods.
 * The caller closes the sheet from [onFoodSelected].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodPickerSheet(
    title: String,
    onDismiss: () -> Unit,
    onFoodSelected: (Food) -> Unit,
    excludeIds: Set<String> = emptySet(),
    foodFilter: (Food) -> Boolean = { true },
    allowOpenFoodFacts: Boolean = true,
    initialQuery: String = "",
    hint: String? = null,
) {
    val viewModel: FoodSearchViewModel = koinViewModel(key = PICKER_VIEW_MODEL_KEY)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val snackbarHostState = remember { SnackbarHostState() }

    val query by viewModel.query.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val allFoods by viewModel.allFoods.collectAsStateWithLifecycle()
    val recentFoods by viewModel.recentFoods.collectAsStateWithLifecycle()
    val favoriteFoods by viewModel.favoriteFoods.collectAsStateWithLifecycle()
    val searchResults by viewModel.searchResults.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()
    val isLoadingMore by viewModel.isLoadingMore.collectAsStateWithLifecycle()
    val offResults by viewModel.offResults.collectAsStateWithLifecycle()
    val isSearchingOff by viewModel.isSearchingOff.collectAsStateWithLifecycle()
    val isResolvingOff by viewModel.isResolvingOff.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.openFoodFactsFallback = allowOpenFoodFacts
        viewModel.resetSearch()
        if (initialQuery.isNotBlank()) viewModel.updateQuery(initialQuery)
    }

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }

    val screenHeight = LocalConfiguration.current.screenHeightDp.dp
    val searching = isSearchQuery(query)
    val onAllTab = selectedTab == FoodSearchViewModel.TAB_ALL
    val shown =
        when (selectedTab) {
            FoodSearchViewModel.TAB_RECENT -> recentFoods.matchingQuery(query)
            FoodSearchViewModel.TAB_FAVORITES -> favoriteFoods.matchingQuery(query)
            else -> if (searching) searchResults else allFoods
        }.pickable(excludeIds, foodFilter)
    val showOpenFoodFacts = allowOpenFoodFacts && searching && onAllTab
    val loading = onAllTab && (if (searching) isSearching else isLoadingMore)

    val listState = rememberLazyListState()
    LaunchedEffect(listState, onAllTab, searching) {
        if (!onAllTab || searching) return@LaunchedEffect
        snapshotFlow { listState.layoutInfo }
            .map { it.visibleItemsInfo.lastOrNull()?.index to it.totalItemsCount }
            .distinctUntilChanged()
            .collect { (lastVisible, total) ->
                if (lastVisible != null && lastVisible >= total - 5) viewModel.loadMoreFoods()
            }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Box(modifier = Modifier.height(screenHeight * 0.9f).imePadding()) {
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { viewModel.updateQuery(it) },
                    placeholder = {
                        Text(stringResource(R.string.food_search_placeholder), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    },
                    leadingIcon = { Icon(Icons.Default.Search, stringResource(R.string.food_search_icon_desc)) },
                    trailingIcon =
                        if (query.isNotEmpty()) {
                            {
                                IconButton(onClick = { viewModel.updateQuery("") }) {
                                    Icon(Icons.Default.Close, stringResource(R.string.daylog_search_clear))
                                }
                            }
                        } else {
                            null
                        },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                hint?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                val tabLabels =
                    listOf(
                        stringResource(R.string.food_search_tab_all),
                        stringResource(R.string.food_search_tab_recent),
                        stringResource(R.string.food_search_tab_favorites),
                    )
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    tabLabels.forEachIndexed { index, label ->
                        SegmentedButton(
                            selected = selectedTab == index,
                            onClick = { viewModel.selectTab(index) },
                            shape = SegmentedButtonDefaults.itemShape(index, tabLabels.size),
                            icon = {},
                        ) {
                            Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))

                val offVisible = showOpenFoodFacts && (isSearchingOff || offResults.isNotEmpty())
                when {
                    shown.isEmpty() && loading ->
                        Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        }
                    shown.isEmpty() && !offVisible ->
                        EmptyState(
                            when {
                                searching -> stringResource(R.string.food_search_no_results, query.trim())
                                selectedTab == FoodSearchViewModel.TAB_RECENT -> stringResource(R.string.food_search_no_recent)
                                selectedTab == FoodSearchViewModel.TAB_FAVORITES -> stringResource(R.string.favorites_no_foods)
                                else -> stringResource(R.string.food_search_no_foods)
                            },
                        )
                    else ->
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(bottom = 32.dp),
                        ) {
                            items(shown, key = { it.id }) { food ->
                                FoodListItem(food = food, onClick = { onFoodSelected(food) })
                            }
                            if (showOpenFoodFacts) {
                                openFoodFactsSection(
                                    products = offResults,
                                    isLoading = isSearchingOff,
                                    enabled = !isResolvingOff,
                                    onSelect = { product -> viewModel.selectOffProduct(product, onFoodSelected) },
                                )
                            }
                        }
                }
            }
            SnackbarHost(snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }
}
