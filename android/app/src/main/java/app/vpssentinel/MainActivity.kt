@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app.vpssentinel

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat

/* App 就是全螢幕打開主機的網頁：第一次輸入網址，之後直接打開；畫面、登入都跟網頁一樣 */
class MainActivity : ComponentActivity() {
    private lateinit var store: Store
    private var url by mutableStateOf("")
    private var failed by mutableStateOf(false)
    private var pageBg by mutableStateOf<Color?>(null)
    private var web: WebView? = null
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var geoAsk: Pair<String, GeolocationPermissions.Callback>? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCb?.onReceiveValue(if (uri == null) null else arrayOf(uri))
        fileCb = null
    }
    private val askLoc = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        geoAsk?.let { (o, cb) -> cb.invoke(o, ok, false) }
        geoAsk = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        store = Store(this)
        url = if (BuildConfig.DEBUG) intent.getStringExtra("url") ?: store.url else store.url     // 自動測試用：直接帶網址進來
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val w = web
                if (w != null && w.canGoBack() && !failed) w.goBack()
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        setContent {
            SentinelTheme(false) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
                    AnimatedContent(url.isEmpty() to failed, label = "page",
                        transitionSpec = { fadeIn(tween(300)) togetherWith fadeOut(tween(200)) }) { (empty, bad) ->
                        when {
                            empty -> Setup(store.url) { web?.destroy(); web = null; store.url = it; failed = false; url = it }
                            bad -> Failed({ failed = false; web?.reload() }, { url = "" })
                            else -> Box(Modifier.fillMaxSize().background(pageBg ?: MaterialTheme.colorScheme.surface)) { Web() }
                        }
                    }
                }
            }
        }
    }

    /* 網頁換深淺色時，狀態列的字跟著換黑白 */
    private fun tint(c: Color) {
        pageBg = c
        val light = c.luminance() > 0.5f
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Composable
    private fun Web() {
        AndroidView(modifier = Modifier.fillMaxSize().systemBarsPadding().imePadding(), factory = { ctx ->
            (web ?: WebView(ctx).also { w ->
                web = w
                w.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                w.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                w.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    setGeolocationEnabled(true)
                    setSupportMultipleWindows(false)       // 「另開視窗」的連結（雲端硬碟）直接在 App 裡打開，按返回回來
                    mediaPlaybackRequiresUserGesture = true
                }
                w.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                        val u = req.url
                        if (u.host == Uri.parse(url).host) return false
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }   // 別的網站用手機的瀏覽器開
                        return true
                    }

                    override fun onPageStarted(view: WebView, u: String?, favicon: Bitmap?) { failed = false }

                    override fun onPageFinished(view: WebView, u: String?) {
                        view.evaluateJavascript(BG) { s -> parse(s)?.let(::tint) }
                    }

                    override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                        if (req.isForMainFrame) failed = true
                    }
                }
                w.webChromeClient = object : WebChromeClient() {
                    override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                        fileCb?.onReceiveValue(null)
                        fileCb = cb
                        pickFile.launch("*/*")
                        return true
                    }

                    override fun onGeolocationPermissionsShowPrompt(origin: String, cb: GeolocationPermissions.Callback) {
                        geoAsk = origin to cb
                        askLoc.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                    }
                }
                w.addJavascriptInterface(object {
                    @android.webkit.JavascriptInterface
                    fun bg(s: String) { runOnUiThread { parse("\"$s\"")?.let(::tint) } }
                }, "VSApp")
                w.loadUrl(url)
            }).also { (it.parent as? ViewGroup)?.removeView(it) }
        }, update = { w ->
            // 網頁切換深淺色、換主題色時通知 App
            w.evaluateJavascript("""(function(){if(window.__vsbg)return;window.__vsbg=1;var f=function(){VSApp.bg($BG)};
                new MutationObserver(f).observe(document.documentElement,{attributes:true});f();})()""", null)
        })
    }

    private fun parse(s: String?): Color? {
        val m = Regex("rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?").find(s ?: return null) ?: return null
        val (r, g, b, a) = m.destructured
        if (a.isNotEmpty() && a.toFloat() < 0.5f) return null          // 透明：還沒載入完
        return Color(r.toInt(), g.toInt(), b.toInt())
    }

    override fun onDestroy() {
        if (isFinishing) web?.destroy()
        super.onDestroy()
    }
}

/** 網頁的底色：body 是透明的就看 html */
private const val BG = "(function(){var c=getComputedStyle(document.body).backgroundColor;" +
    "if(/rgba\\(.*,\\s*0\\)/.test(c))c=getComputedStyle(document.documentElement).backgroundColor;return c})()"

/* 第一次打開：輸入主機網址 */
@Composable
private fun Setup(last: String, go: (String) -> Unit) {
    var u by rememberSaveable { mutableStateOf(last) }
    val ok = { if (u.isNotBlank()) go(clean(u)) }
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding(), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 420.dp).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Logo()
            Spacer(Modifier.height(16.dp))
            Text("VPS 哨兵", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(28.dp))
            OutlinedTextField(u, { u = it }, Modifier.fillMaxWidth(), label = { Text("主機網址") }, placeholder = { Text("https://網域:9443") },
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { ok() }))
            Spacer(Modifier.height(20.dp))
            Button(onClick = ok, modifier = Modifier.fillMaxWidth().height(56.dp), enabled = u.isNotBlank(), shapes = ButtonDefaults.shapes()) {
                Text("打開", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

/* 打不開：重試，或換一個網址 */
@Composable
private fun Failed(retry: () -> Unit, change: () -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 420.dp).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Logo()
            Text("打不開主機", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Button(onClick = retry, modifier = Modifier.fillMaxWidth().height(56.dp), shapes = ButtonDefaults.shapes()) { Text("重試") }
            OutlinedButton(onClick = change, modifier = Modifier.fillMaxWidth().height(56.dp), shapes = ButtonDefaults.shapes()) { Text("換網址") }
        }
    }
}

@Composable
private fun Logo() {
    Box(Modifier.size(96.dp).clip(RoundedCornerShape(28.dp)).background(Color(0xFF3A63E8))) {
        Image(painterResource(R.drawable.ic_bg), null, Modifier.fillMaxSize())
        Image(painterResource(R.drawable.ic_shield), null, Modifier.fillMaxSize())
    }
}

/** 網址整理成 https://網域:埠；貼上安裝完成時的連結（#t=密碼）也照樣能用 */
private fun clean(raw: String): String {
    val u = raw.trim()
    return if (u.startsWith("http://") || u.startsWith("https://")) u else "https://$u"
}
