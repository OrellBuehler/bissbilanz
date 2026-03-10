package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealType
import com.bissbilanz.model.MealTypeCreate
import com.bissbilanz.repository.GoalsRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun SettingsScreen(navController: NavController) {
    val authManager: AuthManager = koinInject()
    val goalsRepo: GoalsRepository = koinInject()
    val api: BissbilanzApi = koinInject()
    val goals by goalsRepo.goals.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var showGoalsDialog by remember { mutableStateOf(false) }
    var showMealTypeDialog by remember { mutableStateOf(false) }
    var customMealTypes by remember { mutableStateOf<List<MealType>>(emptyList()) }

    LaunchedEffect(Unit) {
        goalsRepo.loadGoals()
        try {
            val response = api.getMealTypes()
            customMealTypes = response.mealTypes
        } catch (_: Exception) {
        }
    }

    if (showGoalsDialog) {
        GoalsEditDialog(
            currentGoals = goals,
            onDismiss = { showGoalsDialog = false },
            onSave = { newGoals ->
                scope.launch {
                    try {
                        goalsRepo.setGoals(newGoals)
                        snackbarHostState.showSnackbar("Goals updated")
                    } catch (_: Exception) {
                        snackbarHostState.showSnackbar("Failed to update goals")
                    }
                }
                showGoalsDialog = false
            },
        )
    }

    if (showMealTypeDialog) {
        var newMealName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showMealTypeDialog = false },
            title = { Text("Add Custom Meal Type") },
            text = {
                OutlinedTextField(
                    value = newMealName,
                    onValueChange = { newMealName = it },
                    label = { Text("Meal type name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newMealName.isNotBlank()) {
                        scope.launch {
                            try {
                                api.createMealType(MealTypeCreate(name = newMealName.trim()))
                                val response = api.getMealTypes()
                                customMealTypes = response.mealTypes
                                snackbarHostState.showSnackbar("Meal type added")
                            } catch (_: Exception) {
                                snackbarHostState.showSnackbar("Failed to add meal type")
                            }
                        }
                    }
                    showMealTypeDialog = false
                }) { Text("Add") }
            },
            dismissButton = {
                TextButton(onClick = { showMealTypeDialog = false }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
        ) {
            Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(16.dp))

            // Goals section
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Daily Goals", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    goals?.let { g ->
                        GoalRow("Calories", g.calorieGoal, "kcal", CaloriesBlue)
                        GoalRow("Protein", g.proteinGoal, "g", ProteinRed)
                        GoalRow("Carbs", g.carbGoal, "g", CarbsOrange)
                        GoalRow("Fat", g.fatGoal, "g", FatYellow)
                        GoalRow("Fiber", g.fiberGoal, "g", FiberGreen)
                    } ?: Text("No goals set", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { showGoalsDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Edit, "Edit", modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Edit Goals")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Navigation items
            Card(modifier = Modifier.fillMaxWidth()) {
                Column {
                    SettingsNavItem("Weight Log", Icons.Default.MonitorWeight) {
                        navController.navigate("weight")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Supplements", Icons.Default.Medication) {
                        navController.navigate("supplements")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Recipes", Icons.Default.MenuBook) {
                        navController.navigate("recipes")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Calendar", Icons.Default.CalendarMonth) {
                        navController.navigate("calendar")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Maintenance Calculator", Icons.Default.Calculate) {
                        navController.navigate("maintenance")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Quick actions
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Quick Actions", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilledTonalButton(
                            onClick = { navController.navigate("food_create") },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Add, "Create food", modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Food")
                        }
                        FilledTonalButton(
                            onClick = { navController.navigate("recipe_create") },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Add, "Create recipe", modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Recipe")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Custom meal types
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            "Custom Meal Types",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        IconButton(onClick = { showMealTypeDialog = true }) {
                            Icon(Icons.Default.Add, "Add meal type")
                        }
                    }
                    if (customMealTypes.isEmpty()) {
                        Text(
                            "Default meals only (Breakfast, Lunch, Dinner, Snack)",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        customMealTypes.forEach { mealType ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(mealType.name)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Account
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Account", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(
                        onClick = { authManager.logout() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) {
                        Text("Sign out")
                    }
                }
            }
        }
    }
}

@Composable
fun GoalRow(
    label: String,
    value: Double,
    unit: String,
    color: androidx.compose.ui.graphics.Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = color)
        Text("${value.toInt()} $unit", fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SettingsNavItem(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = { Text(title) },
        leadingContent = { Icon(icon, title, tint = MaterialTheme.colorScheme.primary) },
        trailingContent = { Icon(Icons.AutoMirrored.Filled.ArrowForward, "Go", tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsEditDialog(
    currentGoals: Goals?,
    onDismiss: () -> Unit,
    onSave: (Goals) -> Unit,
) {
    var calories by remember { mutableStateOf(currentGoals?.calorieGoal?.toInt()?.toString() ?: "2000") }
    var protein by remember { mutableStateOf(currentGoals?.proteinGoal?.toInt()?.toString() ?: "150") }
    var carbs by remember { mutableStateOf(currentGoals?.carbGoal?.toInt()?.toString() ?: "250") }
    var fat by remember { mutableStateOf(currentGoals?.fatGoal?.toInt()?.toString() ?: "65") }
    var fiber by remember { mutableStateOf(currentGoals?.fiberGoal?.toInt()?.toString() ?: "30") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Goals") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GoalTextField("Calories (kcal)", calories, CaloriesBlue) { calories = it }
                GoalTextField("Protein (g)", protein, ProteinRed) { protein = it }
                GoalTextField("Carbs (g)", carbs, CarbsOrange) { carbs = it }
                GoalTextField("Fat (g)", fat, FatYellow) { fat = it }
                GoalTextField("Fiber (g)", fiber, FiberGreen) { fiber = it }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onSave(
                    Goals(
                        calorieGoal = calories.toDoubleOrNull() ?: 2000.0,
                        proteinGoal = protein.toDoubleOrNull() ?: 150.0,
                        carbGoal = carbs.toDoubleOrNull() ?: 250.0,
                        fatGoal = fat.toDoubleOrNull() ?: 65.0,
                        fiberGoal = fiber.toDoubleOrNull() ?: 30.0,
                    ),
                )
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun GoalTextField(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = color, focusedLabelColor = color),
    )
}
