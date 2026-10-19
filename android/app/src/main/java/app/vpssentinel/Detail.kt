@file:OptIn(ExperimentalMaterial3ExpressiveApi::class, ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package app.vpssentinel

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/* ═════════ 一台主機的整頁：首頁卡片點開長大成這一頁 ═════════ */

private val CPU = Color(0xFF4F8CFF)
private val MEM = Color(0xFFA06CF0)
private val RX = Color(0xFF14B8C4)
private val TX = Color(0xFFEC5FA0)

@Composable
fun Detail(vm: Vm, key: String, back: () -> Unit) {
    val h = vm.hosts.firstOrNull { it.key == key }
    val bar = TopAppBarDefaults.pinnedScrollBehavior()
    Scaffold(
        Modifier.fillMaxSize().sharedCard(key).nestedScroll(bar.nestedScrollConnection),
        containerColor = MaterialTheme.colorScheme.surface,
        topBar = {
            TopAppBar(title = { Text(h?.name.orEmpty(), maxLines = 1) }, scrollBehavior = bar,
                navigationIcon = { IconButton(back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } })
        },
    ) { pad ->
        if (h == null) return@Scaffold
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item("head") { Head(h) }
            if (!h.online) {
                item("off") { Offline(h) }
                return@LazyColumn
            }
            if (h.problems.isNotEmpty() || h.notices.isNotEmpty()) item("al") { Alerts(h, Modifier.animateItem()) }
            item("tiles") { Tiles(h) }
            item("facts") { Facts(h) }
            item("chart") { CpuChart(vm, h) }
            item("net") { NetCard(vm, h) }
            h.traffic?.let { t -> item("tf") { TrafficCard(t) } }
            if (h.items.isNotEmpty()) item("items") { Items(h) }
            val ev = mergeEv(h.events)
            if (ev.isNotEmpty()) {
                item("evh") { Text("最近事件", Modifier.padding(start = 4.dp, top = 8.dp), style = MaterialTheme.typography.titleMedium) }
                items(ev, key = { "ev:" + it.kind + it.text }) { EventRow(it, false, Modifier.animateItem()) }
            }
        }
    }
}

@Composable
private fun Head(h: Host) {
    Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(h, 56, Modifier.sharedAvatar(h.key))
        Spacer(Modifier.width(14.dp))
        Column {
            Text(h.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            val sub = if (h.online) listOf(place(h), h.os).filter { it.isNotEmpty() }.joinToString("・") + "・開機 ${up(h.uptime)}"
            else h.lastSeen?.let { "離線・${ago(it.toLong())}" } ?: "目前連不上"
            Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/* 四格：處理器、記憶體、磁碟、負載 */
@Composable
private fun Tiles(h: Host) {
    val d = h.disk0
    val lr = h.load / h.cores
    val (lw, lt) = loadWord(lr)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Tile("處理器", "${Num(h.cpu)}%", h.cpu, "${h.cores} 核", Modifier.weight(1f))
            Tile("記憶體", "${Num(h.memPct)}%", h.memPct, "${size(h.memUsed)} / ${size(h.memTotal)}", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Tile("磁碟", "${Num(d.pct)}%", d.pct, "${size(d.used)} / ${size(d.total)}", Modifier.weight(1f))
            Tile("負載", lw, minOf(100.0, lr / 2 * 100), String.format(java.util.Locale.US, "%.2f／%d 核", h.load, h.cores), Modifier.weight(1f), lt)
        }
    }
}

@Composable
private fun Tile(label: String, value: String, pct: Double, sub: String, modifier: Modifier, t: String = tier(pct)) {
    Column(modifier.cardBg().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = tierColor(t))
        Wave(pct)
        Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

/* 一排小膠囊：連線數、IPv6、電信商、其他磁碟 */
@Composable
private fun Facts(h: Host) {
    val f = mutableListOf<String>()
    h.conns?.let { f += "連線 $it" }
    if (h.hasV6) f += if (h.v6Addr == null) "IPv6 位址不見了" else when (h.v6Ok) { false -> "IPv6 連不出去"; true -> "IPv6 正常"; else -> "IPv6 檢查中" }
    if (h.org.isNotEmpty()) f += h.org
    h.disks.drop(1).forEach { f += "磁碟 ${it.path} ${Math.round(it.pct)}%" }
    if (h.swapTotal > 0) f += "虛擬記憶體 ${Math.round(h.swapPct)}%"
    if (f.isEmpty()) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        f.forEach {
            Text(it, Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Range(vm: Vm) {
    val opts = listOf("30m" to "30 分", "24h" to "24 時", "7d" to "7 天")
    SingleChoiceSegmentedButtonRow {
        opts.forEachIndexed { i, (v, l) ->
            SegmentedButton(selected = vm.range == v, onClick = { vm.changeRange(v) }, shape = SegmentedButtonDefaults.itemShape(i, opts.size), label = { Text(l) })
        }
    }
}

@Composable
private fun Legend(c: Color, t: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(c))
        Spacer(Modifier.width(6.dp))
        Text(t, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun ChartBox(hist: Hist?, height: Int, content: @Composable (Hist) -> Unit) {
    // 換時間範圍時，讀取中的轉圈和曲線互相淡入淡出，高度不變
    AnimatedContent(hist, Modifier.fillMaxWidth().height(height.dp), label = "chart", contentKey = { it == null },
        transitionSpec = { fadeIn() togetherWith fadeOut() }) { hs ->
        if (hs == null) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingIndicator() }
        else content(hs)
    }
}

@Composable
private fun CpuChart(vm: Vm, h: Host) {
    val hs = vm.histFor(h)
    Column(Modifier.cardBg().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Legend(CPU, "處理器"); Legend(MEM, "記憶體")
        }
        ChartBox(hs, 140) { Chart(listOf(Series(it.cpu, CPU), Series(it.mem, MEM)), 100f, Modifier.fillMaxSize()) }
        Range(vm)
    }
}

@Composable
private fun NetCard(vm: Vm, h: Host) {
    val hs = vm.histFor(h)
    Column(Modifier.cardBg().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row {
            NetVal("下載", rate(h.rx), RX, Modifier.weight(1f))
            NetVal("上傳", rate(h.tx), TX, Modifier.weight(1f))
        }
        ChartBox(hs, 96) { Chart(listOf(Series(it.rx, RX), Series(it.tx, TX)), null, Modifier.fillMaxSize()) }
    }
}

@Composable
private fun NetVal(l: String, v: String, c: Color, modifier: Modifier) {
    Column(modifier) {
        Text(v, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Legend(c, l)
    }
}

@Composable
private fun TrafficCard(t: Traffic) {
    Column(Modifier.cardBg().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("本月流量", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Text(size(t.used) + if (t.limit > 0) "／${size(t.limit)}" else "", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        }
        if (t.limit > 0) Wave(t.pct ?: 0.0)
        Row {
            Text(t.projected?.let { "預估月底 ${size(it)}" } ?: "預估累積中", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${t.resetDay} 號重置・還有 ${t.daysLeft} 天", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/* 容器與服務：有分組就加小標題 */
@Composable
private fun Items(h: Host) {
    val bad = h.items.count { it.st == "bad" }
    Column(Modifier.cardBg().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row {
            Text("容器與服務", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Text(if (bad > 0) "$bad 個異常" else "${h.items.count { it.st == "ok" }} 個正常", style = MaterialTheme.typography.labelLarge,
                color = if (bad > 0) St.c.bad else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val groups = h.items.map { it.group }.distinct()
        val head = groups.size > 1 || groups.firstOrNull().orEmpty().isNotEmpty()
        groups.forEach { g ->
            val gi = h.items.filter { it.group == g }
            if (head) Text("${g.ifEmpty { "其他容器" }}  ${gi.count { it.st == "ok" }}／${gi.size}", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                gi.forEach { x ->
                    Row(Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Dot(x.st)
                        Spacer(Modifier.width(6.dp))
                        Text(x.short + if (x.st == "ok") "" else "・${x.state}", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
fun EventRow(e: Event, many: Boolean, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().cardBg().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Dot(if (e.kind == "info") "" else e.kind)
        Spacer(Modifier.width(12.dp))
        Column {
            Text((if (many) e.host + "・" else "") + e.text, style = MaterialTheme.typography.bodyLarge)
            Text("${WORD[e.kind].orEmpty()}・${ago(e.t)}" + if (e.n > 1) "・共 ${e.n} 次" else "", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
