package com.bissbilanz.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import kotlin.math.roundToInt

/**
 * Open Food Facts fallback rows appended below the user's own search results.
 * Hits are copy-on-use: tapping one creates the food in the user's database
 * before the caller gets a [com.bissbilanz.api.generated.model.Food].
 */
fun LazyListScope.openFoodFactsSection(
    products: List<OpenFoodFactsProduct>,
    isLoading: Boolean,
    enabled: Boolean,
    onSelect: (OpenFoodFactsProduct) -> Unit,
) {
    if (!isLoading && products.isEmpty()) return
    item(key = "off-header") {
        Text(
            stringResource(R.string.food_search_off_section),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
    if (isLoading) {
        item(key = "off-loading") {
            Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp))
            }
        }
        return
    }
    items(products, key = { "off-${it.barcode}" }) { product ->
        OpenFoodFactsListItem(product = product, enabled = enabled, onClick = { onSelect(product) })
    }
}

@Composable
fun OpenFoodFactsListItem(
    product: OpenFoodFactsProduct,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ListItem(
        headlineContent = { Text(product.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent =
            product.imageUrl?.let { url ->
                {
                    FoodImage(
                        imageUrl = url,
                        contentDescription = product.name,
                        modifier = Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)),
                    )
                }
            },
        supportingContent = {
            Text(
                stringResource(
                    R.string.food_search_item_summary,
                    product.calories.roundToInt(),
                    stringResource(R.string.macro_chip_protein),
                    product.protein.roundToInt(),
                    stringResource(R.string.macro_chip_carbs),
                    product.carbs.roundToInt(),
                    stringResource(R.string.macro_chip_fat),
                    product.fat.roundToInt(),
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent =
            product.brand?.takeIf { it.isNotBlank() }?.let { brand ->
                {
                    Text(
                        brand,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            },
        modifier = modifier.clickable(enabled = enabled, onClick = onClick),
    )
}
