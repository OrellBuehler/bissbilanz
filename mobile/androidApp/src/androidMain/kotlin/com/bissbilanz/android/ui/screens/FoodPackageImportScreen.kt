package com.bissbilanz.android.ui.screens

import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.FileOpen
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.theme.MacroColors
import com.bissbilanz.android.ui.viewmodels.FoodPackageViewModel
import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageConflictNote
import com.bissbilanz.api.generated.model.FoodPackageConflictReason
import com.bissbilanz.api.generated.model.FoodPackageFoodConflict
import com.bissbilanz.api.generated.model.FoodPackageRecipeConflict
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.androidx.compose.koinViewModel

private const val MAX_PACKAGE_BYTES = 50L * 1024 * 1024

/**
 * Review and import a food package someone shared — the Android counterpart of
 * the web's FoodPackageImportDialog. The same file is sent twice (preview, then
 * import with the chosen resolutions), so it is held in the view model.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodPackageImportScreen(navController: NavController) {
    val viewModel: FoodPackageViewModel = koinViewModel()
    val state by viewModel.importState.collectAsStateWithLifecycle()
    val messageRes by viewModel.messageRes.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val resources = LocalResources.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(messageRes) {
        messageRes?.let {
            snackbarHostState.showSnackbar(resources.getString(it))
            viewModel.clearMessage()
        }
    }

    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri == null) return@rememberLauncherForActivityResult
            scope.launch {
                val picked =
                    withContext(Dispatchers.IO) {
                        var name = "package.zip"
                        var size = -1L
                        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) {
                                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                                if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
                                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                            }
                        }
                        if (size > MAX_PACKAGE_BYTES) {
                            null
                        } else {
                            context.contentResolver.openInputStream(uri)?.use { name to it.readBytes() }
                        }
                    }
                if (picked == null || picked.second.size > MAX_PACKAGE_BYTES) {
                    snackbarHostState.showSnackbar(resources.getString(R.string.food_package_file_too_large))
                } else {
                    viewModel.analyze(picked.first, picked.second)
                }
            }
        }
    // Messengers often hand zips over as octet-stream.
    val mimeTypes =
        arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream", "application/json")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.food_package_import_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            val preview = state.preview
            if (preview != null && state.result == null) {
                Box(Modifier.fillMaxWidth().padding(16.dp)) {
                    Button(
                        onClick = { viewModel.commit() },
                        enabled = !state.importing && !state.analyzing,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (state.importing) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text(stringResource(R.string.food_package_import_button))
                        }
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            val preview = state.preview
            val result = state.result
            when {
                viewModel.isLocalMode ->
                    EmptyState(
                        message = stringResource(R.string.food_package_unavailable_local),
                        icon = Icons.Outlined.CloudOff,
                    )
                result != null ->
                    Column(
                        modifier = Modifier.fillMaxSize().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.CheckCircle, null, tint = MacroColors.current.fiber)
                            Text(
                                stringResource(R.string.food_package_result_title),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                        Text(
                            stringResource(
                                R.string.food_package_result_foods,
                                result.created.foods,
                                result.replaced.foods,
                                result.keptBoth.foods,
                                result.skipped.foods,
                            ),
                        )
                        Text(
                            stringResource(
                                R.string.food_package_result_recipes,
                                result.created.recipes,
                                result.replaced.recipes,
                                result.keptBoth.recipes,
                                result.skipped.recipes,
                            ),
                        )
                        result.issues.forEach {
                            Text(
                                it.message,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Button(onClick = { navController.popBackStack() }, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.food_package_done))
                        }
                    }
                state.analyzing ->
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        CircularProgressIndicator()
                        Text(stringResource(R.string.food_package_analyzing), modifier = Modifier.padding(top = 12.dp))
                    }
                preview == null ->
                    Column(
                        modifier = Modifier.fillMaxSize().padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            stringResource(R.string.food_package_import_description),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        Button(onClick = { picker.launch(mimeTypes) }) {
                            Icon(Icons.Outlined.FileOpen, null, modifier = Modifier.size(18.dp))
                            Text(stringResource(R.string.food_package_choose_file), modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                else -> ReviewList(viewModel, state, onPickAnother = { picker.launch(mimeTypes) })
            }
        }
    }
}

@Composable
private fun ReviewList(
    viewModel: FoodPackageViewModel,
    state: FoodPackageViewModel.ImportState,
    onPickAnother: () -> Unit,
) {
    val preview = state.preview ?: return
    val foods = preview.conflicts.foods
    val recipes = preview.conflicts.recipes
    var tab by rememberSaveable { mutableIntStateOf(if (foods.isEmpty() && recipes.isNotEmpty()) 1 else 0) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        stringResource(R.string.food_package_new_counts, preview.newFoods.count, preview.newRecipes.count),
                        fontWeight = FontWeight.Medium,
                    )
                    if (preview.newFoods.ingredientOnly > 0) {
                        SmallText(stringResource(R.string.food_package_ingredient_only, preview.newFoods.ingredientOnly))
                    }
                    SmallText(
                        if (foods.size + recipes.size > 0) {
                            stringResource(R.string.food_package_conflict_count, foods.size + recipes.size)
                        } else {
                            stringResource(R.string.food_package_no_conflicts)
                        },
                    )
                    preview.issues.forEach { SmallText(it.message) }
                    OutlinedButton(onClick = onPickAnother) {
                        Text(stringResource(R.string.food_package_choose_file))
                    }
                }
            }
        }
        if (foods.isNotEmpty() && recipes.isNotEmpty()) {
            item {
                PrimaryTabRow(selectedTabIndex = tab) {
                    Tab(
                        selected = tab == 0,
                        onClick = { tab = 0 },
                        text = { Text(stringResource(R.string.food_package_tab_foods, foods.size)) },
                    )
                    Tab(
                        selected = tab == 1,
                        onClick = { tab = 1 },
                        text = { Text(stringResource(R.string.food_package_tab_recipes, recipes.size)) },
                    )
                }
            }
        }
        val showFoods = tab == 0 && foods.isNotEmpty() || recipes.isEmpty()
        if (showFoods) {
            if (foods.size > 1) {
                item {
                    ApplyAllRow(
                        value = foods.map { state.foods[it.ref] ?: FoodPackageAction.skip }.toSet().singleOrNull(),
                        onChange = viewModel::applyToAllFoods,
                    )
                }
            }
            items(foods, key = { it.ref }) { conflict ->
                FoodConflictCard(
                    conflict = conflict,
                    value = state.foods[conflict.ref] ?: FoodPackageAction.skip,
                    onChange = { viewModel.setFoodAction(conflict.ref, it) },
                )
            }
        } else {
            if (recipes.size > 1) {
                item {
                    ApplyAllRow(
                        value = recipes.map { state.recipes[it.ref] ?: FoodPackageAction.skip }.toSet().singleOrNull(),
                        onChange = viewModel::applyToAllRecipes,
                    )
                }
            }
            items(recipes, key = { it.ref }) { conflict ->
                RecipeConflictCard(
                    conflict = conflict,
                    value = state.recipes[conflict.ref] ?: FoodPackageAction.skip,
                    onChange = { viewModel.setRecipeAction(conflict.ref, it) },
                )
            }
        }
    }
}

@Composable
private fun SmallText(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun ApplyAllRow(
    value: FoodPackageAction?,
    onChange: (FoodPackageAction) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SmallText(stringResource(R.string.food_package_apply_all))
        ResolutionButtons(value = value, allowed = FoodPackageAction.entries, onChange = onChange)
    }
}

@Composable
private fun ResolutionButtons(
    value: FoodPackageAction?,
    allowed: List<FoodPackageAction>,
    onChange: (FoodPackageAction) -> Unit,
) {
    val options = FoodPackageAction.entries
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, action ->
            SegmentedButton(
                selected = value == action,
                onClick = { onChange(action) },
                enabled = action in allowed,
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                icon = {},
            ) {
                Text(
                    when (action) {
                        FoodPackageAction.skip -> stringResource(R.string.food_package_skip)
                        FoodPackageAction.replace -> stringResource(R.string.food_package_replace)
                        FoodPackageAction.keep_both -> stringResource(R.string.food_package_keep_both)
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

@Composable
private fun FoodConflictCard(
    conflict: FoodPackageFoodConflict,
    value: FoodPackageAction,
    onChange: (FoodPackageAction) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AssistChip(
                    onClick = {},
                    label = {
                        Text(
                            when (conflict.reason) {
                                FoodPackageConflictReason.barcode -> stringResource(R.string.food_package_reason_barcode)
                                FoodPackageConflictReason.name_brand -> stringResource(R.string.food_package_reason_name)
                                FoodPackageConflictReason.barcode_and_name ->
                                    stringResource(R.string.food_package_reason_barcode_and_name)
                            },
                        )
                    },
                )
            }
            if (conflict.alsoMatches.isNotEmpty()) {
                SmallText(stringResource(R.string.food_package_also_matches, conflict.alsoMatches.joinToString { it.name }))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FoodSide(
                    title = stringResource(R.string.food_package_incoming),
                    name = conflict.incoming.name,
                    brand = conflict.incoming.brand,
                    serving = "${fmt(conflict.incoming.servingSize)} ${conflict.incoming.servingUnit.value.replace('_', ' ')}",
                    macros =
                        listOf(
                            conflict.incoming.calories,
                            conflict.incoming.protein,
                            conflict.incoming.carbs,
                            conflict.incoming.fat,
                        ),
                    barcode = conflict.incoming.barcode,
                    imageUrl = conflict.incoming.imageUrl,
                    modifier = Modifier.weight(1f),
                )
                FoodSide(
                    title = stringResource(R.string.food_package_existing),
                    name = conflict.existing.name,
                    brand = conflict.existing.brand,
                    serving = "${fmt(conflict.existing.servingSize)} ${conflict.existing.servingUnit.value.replace('_', ' ')}",
                    macros =
                        listOf(
                            conflict.existing.calories,
                            conflict.existing.protein,
                            conflict.existing.carbs,
                            conflict.existing.fat,
                        ),
                    barcode = conflict.existing.barcode,
                    imageUrl = conflict.existing.imageUrl,
                    modifier = Modifier.weight(1f),
                )
            }
            ResolutionButtons(value = value, allowed = conflict.allowed, onChange = onChange)
            conflict.notes.forEach { note ->
                val text =
                    when (note) {
                        FoodPackageConflictNote.replace_changes_history ->
                            stringResource(
                                R.string.food_package_note_history,
                                conflict.existing.entryCount,
                                conflict.existing.recipeCount,
                            )
                        FoodPackageConflictNote.replace_unit_blocked -> stringResource(R.string.food_package_note_unit_blocked)
                        FoodPackageConflictNote.barcode_dropped_on_keep_both ->
                            if (value == FoodPackageAction.keep_both) {
                                stringResource(R.string.food_package_note_barcode_dropped)
                            } else {
                                null
                            }
                        FoodPackageConflictNote.skip_may_copy_for_recipe ->
                            if (value == FoodPackageAction.skip) stringResource(R.string.food_package_note_skip_copy) else null
                        FoodPackageConflictNote.shared_target -> stringResource(R.string.food_package_note_shared_target)
                    }
                if (text != null) {
                    NoteText(text, warn = note == FoodPackageConflictNote.replace_changes_history && value == FoodPackageAction.replace)
                }
            }
        }
    }
}

@Composable
private fun RecipeConflictCard(
    conflict: FoodPackageRecipeConflict,
    value: FoodPackageAction,
    onChange: (FoodPackageAction) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RecipeSide(
                    stringResource(R.string.food_package_incoming),
                    conflict.incoming.name,
                    conflict.incoming.ingredients,
                    conflict.incoming.imageUrl,
                    Modifier.weight(1f),
                )
                RecipeSide(
                    stringResource(R.string.food_package_existing),
                    conflict.existing.name,
                    conflict.existing.ingredients,
                    conflict.existing.imageUrl,
                    Modifier.weight(1f),
                )
            }
            ResolutionButtons(value = value, allowed = conflict.allowed, onChange = onChange)
            if (FoodPackageConflictNote.replace_changes_history in conflict.notes) {
                NoteText(
                    stringResource(R.string.food_package_note_recipe_history, conflict.existing.entryCount),
                    warn = value == FoodPackageAction.replace,
                )
            }
            if (FoodPackageConflictNote.shared_target in conflict.notes) {
                NoteText(stringResource(R.string.food_package_note_shared_target), warn = false)
            }
        }
    }
}

@Composable
private fun NoteText(
    text: String,
    warn: Boolean,
) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(
            Icons.Outlined.Info,
            contentDescription = null,
            modifier = Modifier.size(16.dp).padding(top = 2.dp),
            tint = if (warn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = if (warn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

@Composable
private fun SideBox(
    title: String,
    modifier: Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

@Composable
private fun FoodSide(
    title: String,
    name: String,
    brand: String?,
    serving: String,
    macros: List<Double>,
    barcode: String?,
    imageUrl: String?,
    modifier: Modifier,
) {
    SideBox(title, modifier) {
        PackageThumbnail(imageUrl, name)
        Text(name, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        brand?.let { SmallText(it) }
        SmallText(serving)
        val colors = MacroColors.current
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${fmt(macros[0])} kcal", color = colors.calories, style = MaterialTheme.typography.labelSmall)
            Text("${fmt(macros[1])}P", color = colors.protein, style = MaterialTheme.typography.labelSmall)
            Text("${fmt(macros[2])}C", color = colors.carbs, style = MaterialTheme.typography.labelSmall)
            Text("${fmt(macros[3])}F", color = colors.fat, style = MaterialTheme.typography.labelSmall)
        }
        barcode?.let { SmallText(it) }
    }
}

@Composable
private fun RecipeSide(
    title: String,
    name: String,
    ingredients: List<String>,
    imageUrl: String?,
    modifier: Modifier,
) {
    SideBox(title, modifier) {
        PackageThumbnail(imageUrl, name)
        Text(name, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        SmallText(stringResource(R.string.food_package_ingredients, ingredients.size))
        Text(
            ingredients.joinToString(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** The preview's incoming thumbnails are small inline `data:` URLs; existing images go through [FoodImage]. */
@Composable
private fun PackageThumbnail(
    imageUrl: String?,
    name: String,
) {
    if (imageUrl == null) return
    val modifier = Modifier.size(40.dp).clip(RoundedCornerShape(6.dp))
    if (imageUrl.startsWith("data:")) {
        val bitmap =
            remember(imageUrl) {
                val bytes = Base64.decode(imageUrl.substringAfter(","), Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        bitmap?.let { Image(it, contentDescription = name, modifier = modifier, contentScale = ContentScale.Crop) }
    } else {
        FoodImage(imageUrl = imageUrl, contentDescription = name, modifier = modifier)
    }
}

private fun fmt(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else "%.1f".format(value)
