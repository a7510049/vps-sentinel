@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app.vpssentinel

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.toPath
import kotlin.math.max

/* ═════════ 共用的小元件 ═════════ */

@Composable
fun tierColor(t: String): Color = when (t) {
    "bad" -> St.c.bad
    "warn" -> St.c.warn
    else -> MaterialTheme.colorScheme.primary
}

@Composable
fun levelColor(lv: String): Color = when (lv) {
    "bad" -> St.c.bad
    "warn" -> St.c.warn
    else -> St.c.ok
}

/** 波浪進度條：平常主題色，75% 變橘、90% 變紅；數字變動時用彈簧滑過去 */
@Composable
fun Wave(pct: Double, modifier: Modifier = Modifier) {
    val p by animateFloatAsState((pct / 100).toFloat().coerceIn(0f, 1f), MaterialTheme.motionScheme.slowSpatialSpec(), label = "wave")
    val c by animateColorAsState(tierColor(tier(pct)), MaterialTheme.motionScheme.slowEffectsSpec(), label = "wavec")
    LinearWavyProgressIndicator(progress = { p }, modifier = modifier.fillMaxWidth().height(10.dp), color = c,
        trackColor = MaterialTheme.colorScheme.surfaceContainerHighest)
}

/** 會滑動的數字 */
@Composable
fun Num(v: Double, digits: Int = 0): String {
    val a by animateFloatAsState(v.toFloat(), MaterialTheme.motionScheme.slowSpatialSpec(), label = "num")
    return if (digits == 0) Math.round(a).toString() else String.format(java.util.Locale.US, "%.${digits}f", a)
}

/** 主機頭像：有國家就放國旗，沒有就放名稱第一個字；外圈是狀態色 */
@Composable
fun Avatar(h: Host, size: Int = 44, modifier: Modifier = Modifier) {
    val ring by animateColorAsState(levelColor(h.level), label = "ring")
    val bg = MaterialTheme.colorScheme.surfaceContainerHighest
    val f = flag(h.cc)
    Box(modifier.size(size.dp).clip(CircleShape).background(ring).padding(2.5.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        if (f.isNotEmpty()) Text(f, fontSize = (size * 0.5).sp)
        else Text(h.name.take(1).ifEmpty { "?" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** 首頁大大的狀態：正常／注意／異常各一個形狀，換狀態時形狀慢慢變過去，平常緩緩轉 */
@Composable
fun StatusBlob(lv: String, modifier: Modifier = Modifier) {
    val shapes = remember { mapOf("ok" to MaterialShapes.Cookie9Sided, "warn" to MaterialShapes.SoftBurst, "bad" to MaterialShapes.Burst) }
    val target = shapes[lv] ?: MaterialShapes.Cookie9Sided
    var pair by remember { mutableStateOf(target to target) }
    val prog = remember { Animatable(1f) }
    LaunchedEffect(target) {
        if (pair.second !== target) {
            pair = pair.second to target
            prog.snapTo(0f)
            prog.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = 120f))
        }
    }
    val morph = remember(pair) { Morph(pair.first, pair.second) }
    val spin by rememberInfiniteTransition(label = "spin").animateFloat(0f, 360f,
        infiniteRepeatable(tween(40000, easing = LinearEasing), RepeatMode.Restart), label = "spin")
    val col by animateColorAsState(levelColor(lv), MaterialTheme.motionScheme.slowEffectsSpec(), label = "blobc")
    val cont by animateColorAsState(when (lv) { "bad" -> St.c.badC; "warn" -> St.c.warnC; else -> St.c.okC }, label = "blobcc")
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(64.dp)) {
            val path = morph.toPath(prog.value.coerceIn(0f, 1f)).asComposePath()
            val m = Matrix().apply { scale(size.width, size.height) }
            path.transform(m)
            rotate(spin) { drawPath(path, cont) }
        }
        Icon(when (lv) { "bad" -> Icons.Filled.Close; "warn" -> Icons.Filled.Info; else -> Icons.Filled.Check }, null,
            tint = col, modifier = Modifier.size(30.dp))
    }
}

/** 按下去會微微縮小，放開彈回來 */
@Composable
fun Modifier.squish(src: MutableInteractionSource): Modifier {
    val pressed by src.collectIsPressedAsState()
    val s by animateFloatAsState(if (pressed) 0.96f else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "squish")
    return graphicsLayer { scaleX = s; scaleY = s }
}

/** 警告列：紅色是出問題、橘色是要留意 */
@Composable
fun Alerts(h: Host, modifier: Modifier = Modifier) {
    if (h.problems.isEmpty() && h.notices.isEmpty()) return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        h.problems.forEach { AlertRow(it, true) }
        h.notices.forEach { AlertRow(it, false) }
    }
}

@Composable
private fun AlertRow(t: String, bad: Boolean) {
    val fg = if (bad) St.c.bad else St.c.warn
    val bg = if (bad) St.c.badC else St.c.warnC
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(bg.copy(alpha = 0.6f)).padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Warning, null, tint = fg, modifier = Modifier.size(18.dp))
        Box(Modifier.width(8.dp))
        Text(t, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
fun Dot(st: String, modifier: Modifier = Modifier) {
    val c = when (st) { "ok" -> St.c.ok; "bad" -> St.c.bad; "warn" -> St.c.warn; else -> MaterialTheme.colorScheme.outline }
    Box(modifier.size(8.dp).clip(CircleShape).background(c))
}

/* ═════════ 曲線圖：資料更新時，舊曲線直接變形成新曲線 ═════════ */

data class Series(val data: List<Float>, val color: Color)

private fun resample(v: List<Float>, n: Int): FloatArray {
    if (v.isEmpty()) return FloatArray(n)
    if (v.size == 1) return FloatArray(n) { v[0] }
    return FloatArray(n) { i ->
        val x = i * (v.size - 1f) / (n - 1)
        val a = x.toInt().coerceAtMost(v.size - 2)
        v[a] + (v[a + 1] - v[a]) * (x - a)
    }
}

private fun niceMax(m: Float): Float {
    if (m <= 0) return 1f
    var p = 1f
    while (p * 10 <= m) p *= 10
    for (k in listOf(1f, 2f, 5f, 10f)) if (p * k >= m) return p * k
    return p * 10
}

@Composable
fun Chart(series: List<Series>, max: Float? = null, modifier: Modifier = Modifier) {
    val n = 96
    val target = remember(series) { series.map { resample(it.data, n) } }
    val shown = remember { mutableListOf<FloatArray>() }
    val from = remember { mutableListOf<FloatArray>() }
    val t = remember { Animatable(1f) }
    LaunchedEffect(target) {
        from.clear(); from.addAll(if (shown.size == target.size) shown.map { it.copyOf() } else target.map { FloatArray(n) })
        t.snapTo(0f)
        t.animateTo(1f, tween(600))
    }
    val grid = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier.fillMaxWidth()) {
        val k = t.value
        val cur = target.mapIndexed { si, tg ->
            val f = from.getOrNull(si)
            if (f == null) tg else FloatArray(n) { f[it] + (tg[it] - f[it]) * k }
        }
        shown.clear(); shown.addAll(cur)
        val top = max ?: niceMax(cur.maxOfOrNull { it.maxOrNull() ?: 0f }?.let { max(it, 1f) } ?: 1f)
        val w = size.width; val h = size.height
        for (g in 0..2) {
            val y = h * g / 2f
            drawLine(grid.copy(alpha = 0.5f), Offset(0f, y), Offset(w, y), 1f)
        }
        cur.forEachIndexed { si, v ->
            val c = series[si].color
            val pts = v.mapIndexed { i, y -> Offset(w * i / (n - 1), h - (y / top).coerceIn(0f, 1f) * h) }
            val line = Path().apply {
                moveTo(pts[0].x, pts[0].y)
                for (i in 1 until pts.size) {
                    val p0 = pts[i - 1]; val p1 = pts[i]; val mx = (p0.x + p1.x) / 2
                    cubicTo(mx, p0.y, mx, p1.y, p1.x, p1.y)
                }
            }
            val area = Path().apply { addPath(line); lineTo(w, h); lineTo(0f, h); close() }
            drawPath(area, Brush.verticalGradient(listOf(c.copy(alpha = 0.28f), c.copy(alpha = 0f))))
            drawPath(line, c, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round))
        }
    }
}

/** 卡片底色：一般 surfaceContainer，比較重要的用 High */
@Composable
fun Modifier.cardBg(high: Boolean = false) = clip(RoundedCornerShape(24.dp))
    .background(if (high) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surfaceContainer)
