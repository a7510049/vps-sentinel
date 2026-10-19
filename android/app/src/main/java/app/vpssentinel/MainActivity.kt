@file:OptIn(ExperimentalSharedTransitionApi::class, ExperimentalMaterial3ExpressiveApi::class)

package app.vpssentinel

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.ShortNavigationBar
import androidx.compose.material3.ShortNavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

class MainActivity : ComponentActivity() {
    private val vm: Vm by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (BuildConfig.DEBUG) intent.getStringExtra("url")?.let { url ->     // 自動測試用：直接帶網址和密碼進來
            vm.adopt(url, intent.getStringExtra("token").orEmpty())
            intent.removeExtra("url")
        }
        setContent {
            SentinelTheme(vm.dynamic) { App(vm) }
        }
    }
}

val LocalShared = compositionLocalOf<SharedTransitionScope?> { null }
val LocalNavScope = compositionLocalOf<AnimatedVisibilityScope?> { null }

@Composable
fun App(vm: Vm) {
    val api = vm.api
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        AnimatedContent(api == null, transitionSpec = { fadeIn(tween(300)) togetherWith fadeOut(tween(200)) }, label = "auth") { out ->
            if (out) Login(vm) else Signed(vm)
        }
    }
}

@Composable
private fun Signed(vm: Vm) {
    val life = LocalLifecycleOwner.current
    LaunchedEffect(vm.api) {
        life.repeatOnLifecycle(Lifecycle.State.STARTED) { vm.loop() }     // 只在畫面開著的時候更新
    }
    val nav = rememberNavController()
    SharedTransitionLayout {
        CompositionLocalProvider(LocalShared provides this) {
            NavHost(nav, "main",
                enterTransition = { fadeIn(tween(300)) }, exitTransition = { fadeOut(tween(300)) },
                popEnterTransition = { fadeIn(tween(300)) }, popExitTransition = { fadeOut(tween(300)) }) {
                composable("main") {
                    CompositionLocalProvider(LocalNavScope provides this) {
                        Tabs(vm) { nav.navigate("host/" + Uri.encode(it)) }
                    }
                }
                composable("host/{k}") { e ->
                    val k = e.arguments?.getString("k").orEmpty()
                    CompositionLocalProvider(LocalNavScope provides this) {
                        Detail(vm, k) { nav.popBackStack() }
                    }
                }
            }
        }
    }
}

private val TABS = listOf(Triple("home", "首頁", Icons.Filled.Home), Triple("log", "紀錄", Icons.AutoMirrored.Filled.List),
    Triple("set", "設定", Icons.Filled.Settings))

@Composable
private fun Tabs(vm: Vm, open: (String) -> Unit) {
    var tab by rememberSaveable { mutableStateOf("home") }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.surface,
        bottomBar = {
            ShortNavigationBar {
                TABS.forEach { (k, l, ic) ->
                    ShortNavigationBarItem(selected = tab == k, onClick = { tab = k }, icon = { Icon(ic, null) }, label = { Text(l) })
                }
            }
        },
    ) { pad ->
        // 換分頁：舊的先淡出，新的從稍微小一點淡入（Material 的「淡出淡入」）
        AnimatedContent(tab, Modifier.fillMaxSize().padding(bottom = pad.calculateBottomPadding()), label = "tab",
            transitionSpec = { (fadeIn(tween(210, 90)) + scaleIn(tween(210, 90), 0.94f)) togetherWith fadeOut(tween(90)) }) { t ->
            Box(Modifier.fillMaxSize()) {
                when (t) {
                    "home" -> Home(vm, open)
                    "log" -> LogPage(vm)
                    else -> SettingsPage(vm)
                }
            }
        }
    }
}
