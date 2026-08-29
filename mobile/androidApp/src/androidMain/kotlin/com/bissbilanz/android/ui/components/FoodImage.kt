package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.bissbilanz.android.images.FoodImageResolver
import org.koin.compose.koinInject

/**
 * A food or recipe image, resolved through [FoodImageResolver] so a
 * server-hosted image is fetched with the account's token, kept on device and
 * shown offline. Renders nothing until the model resolves, and nothing at all
 * when there is no image.
 */
@Composable
fun FoodImage(
    imageUrl: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    alignment: Alignment = Alignment.Center,
) {
    val resolver: FoodImageResolver = koinInject()
    val model by produceState<Any?>(initialValue = null, imageUrl) {
        value = resolver.resolve(imageUrl)
    }

    if (model != null) {
        AsyncImage(
            model = model,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
            alignment = alignment,
        )
    }
}
