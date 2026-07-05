package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.util.formatAsInt

/**
 * Compact P/C/F(/Fi) chip row used under meal and food summaries. [fiber] is optional
 * since most call sites only surface protein/carbs/fat.
 */
@Composable
fun MacroChipRow(
    protein: Double,
    carbs: Double,
    fat: Double,
    fiber: Double? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "${stringResource(R.string.macro_chip_protein)} ${protein.formatAsInt()}g",
            style = MaterialTheme.typography.labelSmall,
            color = ProteinRed,
        )
        Text(
            "${stringResource(R.string.macro_chip_carbs)} ${carbs.formatAsInt()}g",
            style = MaterialTheme.typography.labelSmall,
            color = CarbsOrange,
        )
        Text(
            "${stringResource(R.string.macro_chip_fat)} ${fat.formatAsInt()}g",
            style = MaterialTheme.typography.labelSmall,
            color = FatYellow,
        )
        if (fiber != null) {
            Text(
                "${stringResource(R.string.macro_chip_fiber)} ${fiber.formatAsInt()}g",
                style = MaterialTheme.typography.labelSmall,
                color = FiberGreen,
            )
        }
    }
}
