package com.bissbilanz.android.widget

import android.content.Context
import android.content.res.Configuration
import android.graphics.BitmapFactory
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.json.Json
import java.io.File

private data class FavoriteTile(
    val id: String,
    val name: String,
    val imageProvider: ImageProvider,
)

class FavoritesWidget : GlanceAppWidget() {
    override val sizeMode =
        SizeMode.Responsive(
            setOf(
                DpSize(300.dp, 120.dp),
                DpSize(300.dp, 240.dp),
            ),
        )

    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val db = koin.get<BissbilanzDatabase>()
        val json = koin.get<Json>()

        val rows = db.bissbilanzDatabaseQueries.selectFavorites().executeAsList()
        val favorites = rows.mapNotNull { json.decodeOrNull<Food>(it.jsonData) }

        val imageDir = File(context.cacheDir, "widget_food_images")
        val density = context.resources.displayMetrics.density
        val tilePx = (56 * density).toInt()
        val isDark =
            (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES

        val tiles =
            favorites.map { food ->
                val cachedFile = File(imageDir, "${food.id}.png")
                val bitmap =
                    if (cachedFile.exists()) {
                        BitmapFactory.decodeFile(cachedFile.absolutePath)
                            ?: FavoritePlaceholderRenderer.render(food.name, tilePx, isDark)
                    } else {
                        FavoritePlaceholderRenderer.render(food.name, tilePx, isDark)
                    }
                FavoriteTile(food.id, food.name, ImageProvider(bitmap))
            }

        provideContent {
            GlanceTheme {
                FavoritesContent(tiles)
            }
        }
    }

    companion object {
        suspend fun updateAllWidgets(context: Context) {
            val manager = GlanceAppWidgetManager(context)
            val ids = manager.getGlanceIds(FavoritesWidget::class.java)
            ids.forEach { id -> FavoritesWidget().update(context, id) }
        }
    }
}

@Composable
private fun FavoritesContent(tiles: List<FavoriteTile>) {
    val context = LocalContext.current
    val size = LocalSize.current
    val rows = if (size.height >= 200.dp) 4 else 2
    val columns = 5

    if (tiles.isEmpty()) {
        Box(
            modifier =
                GlanceModifier
                    .fillMaxSize()
                    .cornerRadius(16.dp)
                    .background(GlanceTheme.colors.background)
                    .clickable(actionStartActivity<MainActivity>()),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = context.getString(R.string.favorites_widget_empty),
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onSurface,
                        textAlign = TextAlign.Center,
                    ),
            )
        }
        return
    }

    Column(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .padding(6.dp),
    ) {
        for (row in 0 until rows) {
            if (row > 0) Spacer(modifier = GlanceModifier.height(4.dp))
            Row(
                modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                for (col in 0 until columns) {
                    if (col > 0) Spacer(modifier = GlanceModifier.width(4.dp))
                    val index = row * columns + col
                    Box(
                        modifier = GlanceModifier.defaultWeight().fillMaxSize(),
                    ) {
                        if (index < tiles.size) {
                            val tile = tiles[index]
                            Image(
                                provider = tile.imageProvider,
                                contentDescription = tile.name,
                                contentScale = ContentScale.Crop,
                                modifier =
                                    GlanceModifier
                                        .fillMaxSize()
                                        .cornerRadius(8.dp)
                                        .clickable(
                                            actionRunCallback<LogFavoriteFoodAction>(
                                                actionParametersOf(
                                                    FoodIdKey to tile.id,
                                                    FoodNameKey to tile.name,
                                                ),
                                            ),
                                        ),
                            )
                        } else {
                            Spacer(modifier = GlanceModifier.fillMaxSize())
                        }
                    }
                }
            }
        }
    }
}
