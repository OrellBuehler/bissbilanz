package com.bissbilanz.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.util.Markdown
import com.bissbilanz.android.util.MdBlock
import com.bissbilanz.android.util.MdSpan

/** Renders the Markdown of an assistant answer with native text, see [Markdown]. */
@Composable
fun MarkdownText(
    markdown: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
) {
    val blocks = remember(markdown) { Markdown.parse(markdown) }
    val linkColor = MaterialTheme.colorScheme.primary
    val codeBackground = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        blocks.forEach { block ->
            when (block) {
                is MdBlock.Paragraph -> Text(block.spans.annotated(linkColor, codeBackground), style = style)
                is MdBlock.Heading ->
                    Text(
                        block.spans.annotated(linkColor, codeBackground),
                        style = if (block.level <= 2) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                is MdBlock.ListItem ->
                    Row(modifier = Modifier.padding(start = (block.depth * 16).dp)) {
                        Text(
                            block.number?.let { "$it." } ?: BULLET,
                            style = style,
                            modifier = Modifier.widthIn(min = 20.dp).padding(end = 4.dp),
                        )
                        Text(block.spans.annotated(linkColor, codeBackground), style = style, modifier = Modifier.weight(1f))
                    }
                is MdBlock.Quote ->
                    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
                        Box(
                            modifier =
                                Modifier
                                    .width(3.dp)
                                    .fillMaxHeight()
                                    .background(LocalContentColor.current.copy(alpha = 0.3f), MaterialTheme.shapes.extraSmall),
                        )
                        Text(
                            block.spans.annotated(linkColor, codeBackground),
                            style = style,
                            fontStyle = FontStyle.Italic,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                is MdBlock.Code ->
                    Surface(color = codeBackground, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                        Text(
                            block.text,
                            style = style.copy(fontFamily = FontFamily.Monospace),
                            softWrap = false,
                            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(8.dp),
                        )
                    }
                MdBlock.Rule ->
                    HorizontalDivider(
                        modifier = Modifier.padding(vertical = 4.dp),
                        color = LocalContentColor.current.copy(alpha = 0.2f),
                    )
            }
        }
    }
}

private const val BULLET = "•"

private fun List<MdSpan>.annotated(
    linkColor: Color,
    codeBackground: Color,
): AnnotatedString =
    buildAnnotatedString {
        forEach { span ->
            val spanStyle =
                SpanStyle(
                    fontWeight = if (span.bold) FontWeight.SemiBold else null,
                    fontStyle = if (span.italic) FontStyle.Italic else null,
                    fontFamily = if (span.code) FontFamily.Monospace else null,
                    background = if (span.code) codeBackground else Color.Unspecified,
                )
            val url = span.url
            if (url != null) {
                withLink(
                    LinkAnnotation.Url(
                        url,
                        TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)),
                    ),
                ) { withStyle(spanStyle) { append(span.text) } }
            } else {
                withStyle(spanStyle) { append(span.text) }
            }
        }
    }
