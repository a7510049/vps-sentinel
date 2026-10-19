@file:OptIn(ExperimentalSharedTransitionApi::class, ExperimentalMaterial3ExpressiveApi::class, ExperimentalMaterial3Api::class)

package app.vpssentinel

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ContainedLoadingIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/* ═════════ 首頁：一句話說完有沒有事，下面每台主機一張卡片 ═════════ */

@Composable
fun Home(vm: Vm, open: (String) -> Unit) {
    val list = vm.hosts
    val st = rememberPullToRefreshState()
    PullToRefreshBox(vm.refreshing, { vm.pull() }, Modifier.fillMaxSize(), state = st,
        indicator = { PullToRefreshDefaults.LoadingIndicator(state = st, isRefreshing = vm.refreshing, modifier = Modifier.align(Alignment.TopCenter)) }) {
        if (list.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                if (vm.error == null) ContainedLoadingIndicator()
                else Text(vm.error.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            return@PullToRefreshBox
        }
        val top = WindowInsets.safeDrawing.asPaddingValues().calculateTopPadding()
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item("hero") { Hero(vm, list) }
            items(list, key = { it.key }) { h ->
                HostCard(h, Modifier.animateItem()) { open(h.key) }
            }
        }
    }
}

@Composable
private fun Hero(vm: Vm, list: List<Host>) {
    val lv = if (list.any { it.level == "bad" }) "bad" else if (list.any { it.level == "warn" }) "warn" else "ok"
    Column(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, bottom = 8.dp)) {
        StatusBlob(lv, Modifier.size(72.dp))
        Spacer(Modifier.height(14.dp))
        Text("${greet()}・${if (vm.updated > 0) hm(vm.updated / 1000) else "--:--"} 更新", style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        // 狀況改變時，舊的一句往上滑走、新的從下面滑上來
        AnimatedContent(headline(list), label = "headline", transitionSpec = {
            (slideInVertically { it / 2 } + fadeIn()) togetherWith (slideOutVertically { -it / 2 } + fadeOut())
        }) { t ->
            Text(t, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
        }
        AnimatedVisibility(vm.error != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Warning, null, tint = St.c.warn, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(vm.error.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = St.c.warn)
            }
        }
    }
}

/** 卡片點下去會長大成整頁（同一個畫面元素變形過去，不是換頁） */
@Composable
fun Modifier.sharedCard(key: String): Modifier {
    val s = LocalShared.current ?: return this
    val a = LocalNavScope.current ?: return this
    return with(s) {
        this@sharedCard.sharedBounds(rememberSharedContentState("card-$key"), a,
            resizeMode = SharedTransitionScope.ResizeMode.RemeasureToBounds,
            clipInOverlayDuringTransition = OverlayClip(RoundedCornerShape(28.dp)))
    }
}

@Composable
fun Modifier.sharedAvatar(key: String): Modifier {
    val s = LocalShared.current ?: return this
    val a = LocalNavScope.current ?: return this
    return with(s) { this@sharedAvatar.sharedElement(rememberSharedContentState("av-$key"), a) }
}

@Composable
private fun HostCard(h: Host, modifier: Modifier, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    Column(modifier.fillMaxWidth().squish(src).sharedCard(h.key).clip(RoundedCornerShape(28.dp))
        .cardBg().clickable(src, androidx.compose.material3.ripple(), onClick = onClick).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(h, modifier = Modifier.sharedAvatar(h.key))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(h.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val sub = place(h).ifEmpty { h.os }
                if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!h.online) {
            Offline(h)
            return@Column
        }
        Alerts(h)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Meter("處理器", h.cpu)
            Meter("記憶體", h.memPct)
            Meter("磁碟", h.disk0.pct)
        }
        val foot = listOfNotNull(h.traffic?.let { "本月 ${size(it.used)}" }, "開機 ${up(h.uptime)}").joinToString("・")
        Text(foot, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Meter(label: String, pct: Double) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.width(52.dp), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Wave(pct, Modifier.weight(1f))
        Text("${Num(pct)}%", Modifier.width(48.dp), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
            color = tierColor(tier(pct)), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
fun Offline(h: Host) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).cardBg(true).padding(14.dp)) {
        Text("連不上這台主機", style = MaterialTheme.typography.titleSmall, color = St.c.bad)
        h.lastSeen?.let { Text("最後連上：${ago(it.toLong())}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (h.error.isNotEmpty()) Text(h.error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
