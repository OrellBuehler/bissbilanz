package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.Food
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodDetailScreen(foodId: String, navController: NavController) {
    val foodRepo: FoodRepository = koinInject()
    var food by remember { mutableStateOf<Food?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(foodId) {
        food = foodRepo.getFood(foodId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(food?.name ?: "Loading...") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        food?.let { f ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp)
            ) {
                f.brand?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(8.dp))
                }

                Text(
                    "Per ${f.servingSize.toInt()} ${f.servingUnit.name.lowercase()}",
                    style = MaterialTheme.typography.labelLarge
                )
                Spacer(modifier = Modifier.height(16.dp))

                // Main macros
                MacroRow("Calories", f.calories, "kcal", CaloriesBlue)
                MacroRow("Protein", f.protein, "g", ProteinRed)
                MacroRow("Carbs", f.carbs, "g", CarbsOrange)
                MacroRow("Fat", f.fat, "g", FatYellow)
                MacroRow("Fiber", f.fiber, "g", FiberGreen)

                // Extended nutrients
                f.saturatedFat?.let { MacroRow("Saturated Fat", it, "g") }
                f.sugar?.let { MacroRow("Sugar", it, "g") }
                f.sodium?.let { MacroRow("Sodium", it, "mg") }
                f.cholesterol?.let { MacroRow("Cholesterol", it, "mg") }
                f.vitaminC?.let { MacroRow("Vitamin C", it, "mg") }
                f.vitaminD?.let { MacroRow("Vitamin D", it, "µg") }
                f.calcium?.let { MacroRow("Calcium", it, "mg") }
                f.iron?.let { MacroRow("Iron", it, "mg") }
                f.potassium?.let { MacroRow("Potassium", it, "mg") }
            }
        }
    }
}

@Composable
fun MacroRow(
    label: String,
    value: Double,
    unit: String,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = color)
        Text("${if (value == value.toLong().toDouble()) value.toLong().toString() else "%.1f".format(value)} $unit")
    }
}
