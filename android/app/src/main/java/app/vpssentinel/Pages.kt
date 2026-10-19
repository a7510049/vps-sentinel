@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app.vpssentinel

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/* ═════════ 紀錄：所有主機的事件合在一起，按日期分段 ═════════ */

@Composable
fun LogPage(vm: Vm) {
    val ev = allEvents(vm.hosts)
    val many = vm.hosts.size > 1
    val top = WindowInsets.safeDrawing.asPaddingValues().calculateTopPadding()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item("title") { PageTitle("紀錄") }
        if (ev.isEmpty()) item("calm") {
            Text("目前沒有事件", Modifier.padding(4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        var day = ""
        ev.forEach { e ->
            val d = dayOf(e.t)
            if (d != day) {
                day = d
                item("d:$d") { Text(d, Modifier.padding(start = 4.dp, top = 8.dp).animateItem(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary) }
            }
            item("${e.hostKey}|${e.kind}:${e.text}") { EventRow(e, many, Modifier.animateItem()) }
        }
    }
}

@Composable
private fun PageTitle(t: String) {
    Text(t, Modifier.padding(start = 4.dp, bottom = 8.dp), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
}

/* ═════════ 設定 ═════════ */

@Composable
fun SettingsPage(vm: Vm) {
    val top = WindowInsets.safeDrawing.asPaddingValues().calculateTopPadding()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = top + 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageTitle("設定")
        val item = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
        Column(Modifier.cardBg()) {
            ListItem(headlineContent = { Text("自動更新") }, supportingContent = { Text("每 ${vm.refresh} 秒") },
                colors = ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent))
            val opts = listOf(5, 10, 30)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                opts.forEachIndexed { i, v ->
                    SegmentedButton(vm.refresh == v, { vm.changeRefresh(v) }, SegmentedButtonDefaults.itemShape(i, opts.size)) { Text("$v 秒") }
                }
            }
        }
        if (Build.VERSION.SDK_INT >= 31) {
            ListItem(headlineContent = { Text("跟著桌布換顏色") },
                trailingContent = { Switch(vm.dynamic, { vm.changeDynamic(it) }) },
                modifier = Modifier.clip(RoundedCornerShape(24.dp)).clickable { vm.changeDynamic(!vm.dynamic) }, colors = item)
        }
        ListItem(headlineContent = { Text("主機") }, supportingContent = { Text(vm.store.url) }, modifier = Modifier.clip(RoundedCornerShape(24.dp)), colors = item)
        ListItem(headlineContent = { Text("登出", color = St.c.bad) }, modifier = Modifier.clip(RoundedCornerShape(24.dp)).clickable { vm.logout() }, colors = item)
        Text("App 版本 ${BuildConfig.VERSION_NAME}（${BuildConfig.VERSION_CODE}）", Modifier.padding(start = 4.dp),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/* ═════════ 登入 ═════════ */

@Composable
fun Login(vm: Vm) {
    var url by rememberSaveable { mutableStateOf(vm.store.url) }
    var pw by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf(vm.loginMsg) }
    val shake = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val go: () -> Unit = {
        if (!busy) scope.launch {
            busy = true; err = null
            err = vm.login(url, pw)
            busy = false
            if (err != null) {
                for (x in listOf(14f, -12f, 8f, -5f, 0f)) shake.animateTo(x, SHAKE)
            }
        }
    }
    Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 420.dp).padding(24.dp).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(96.dp).clip(RoundedCornerShape(28.dp))) {
                Image(painterResource(R.drawable.ic_bg), null, Modifier.fillMaxSize())
                Image(painterResource(R.drawable.ic_shield), null, Modifier.fillMaxSize())
            }
            Spacer(Modifier.height(16.dp))
            Text("VPS 哨兵", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(28.dp))
            Column(Modifier.offset { IntOffset(shake.value.roundToInt(), 0) }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text("主機網址") }, placeholder = { Text("https://網域:9443") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next))
                OutlinedTextField(pw, { pw = it }, Modifier.fillMaxWidth(), label = { Text("密碼或 PIN 碼") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { go() }))
            }
            AnimatedVisibility(err != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Text(err.orEmpty(), Modifier.padding(top = 12.dp), color = St.c.bad, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(20.dp))
            Button(onClick = go, modifier = Modifier.fillMaxWidth().height(56.dp), enabled = url.isNotBlank(), shapes = ButtonDefaults.shapes()) {
                if (busy) LoadingIndicator(Modifier.size(28.dp), color = MaterialTheme.colorScheme.onPrimary) else Text("進入", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

private val SHAKE = androidx.compose.animation.core.spring<Float>(dampingRatio = 0.5f, stiffness = 1500f)
