package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayLogScreen(date: String, navController: NavController) {
    val entryRepo: EntryRepository = koinInject()
    val entries by entryRepo.entries.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    LaunchedEffect(date) {
        entryRepo.loadEntries(date)
    }

    val mealGroups = entries.groupBy { it.mealType }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(date) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            mealGroups.forEach { (meal, mealEntries) ->
                item {
                    Text(
                        meal.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
                items(mealEntries) { entry ->
                    EntryListItem(entry) {
                        scope.launch {
                            entryRepo.deleteEntry(entry.id)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EntryListItem(entry: Entry, onDelete: () -> Unit) {
    val name = entry.food?.name ?: entry.recipe?.name ?: entry.quickName ?: "Unknown"
    val calories = entry.food?.calories?.times(entry.servings)
        ?: entry.quickCalories?.times(entry.servings) ?: 0.0

    ListItem(
        headlineContent = { Text(name) },
        supportingContent = {
            Text("${entry.servings}x · ${calories.toInt()} cal")
        },
        trailingContent = {
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
            }
        }
    )
}
