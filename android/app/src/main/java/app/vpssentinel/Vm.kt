package app.vpssentinel

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class Vm(app: Application) : AndroidViewModel(app) {
    val store = Store(app)

    var api by mutableStateOf(store.url.takeIf { it.isNotEmpty() && store.token.isNotEmpty() }?.let { Api(it, store.token) })
        private set
    var hosts by mutableStateOf<List<Host>>(emptyList())
        private set
    var updated by mutableLongStateOf(0L)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var refreshing by mutableStateOf(false)
        private set
    var loginMsg by mutableStateOf<String?>(null)
    var refresh by mutableIntStateOf(store.refresh)
        private set
    var dynamic by mutableStateOf(store.dynamic)
        private set
    var range by mutableStateOf(store.range)
        private set

    /** 24 小時、7 天的曲線另外抓，存 1 分鐘 */
    val hist = mutableStateMapOf<String, Pair<Long, Hist?>>()
    private val histBusy = mutableSetOf<String>()

    /** 畫面開著才更新；有事的主機排前面 */
    suspend fun loop() {
        while (true) {
            fetch()
            delay(refresh * 1000L)
        }
    }

    private suspend fun fetch() {
        val a = api ?: return
        try {
            val rank = mapOf("bad" to 0, "warn" to 1)
            hosts = a.all().withIndex().sortedWith(compareBy({ rank[it.value.level] ?: 2 }, { it.index })).map { it.value }
            updated = System.currentTimeMillis()
            error = null
        } catch (e: ApiError) {
            if (e.code == 401) logout("密碼換過了，請重新登入") else error = e.message
        }
    }

    fun pull() {
        viewModelScope.launch {
            refreshing = true
            fetch()
            refreshing = false
        }
    }

    suspend fun login(rawUrl: String, pw: String): String? {
        val (url, fromLink) = Api.clean(rawUrl)
        val input = pw.trim().ifEmpty { fromLink.orEmpty() }
        if (input.isEmpty()) return "請輸入密碼"
        return try {
            val tok = Api.login(url, input)
            store.url = url
            store.token = tok
            loginMsg = null
            api = Api(url, tok)
            fetch()
            null
        } catch (e: ApiError) {
            e.message
        }
    }

    fun adopt(url: String, tok: String) {
        store.url = url
        store.token = tok
        api = Api(url, tok)
    }

    fun logout(msg: String? = null) {
        store.token = ""
        api = null
        hosts = emptyList()
        hist.clear()
        loginMsg = msg
    }

    fun setRefresh(v: Int) { refresh = v; store.refresh = v }
    fun setDynamic(v: Boolean) { dynamic = v; store.dynamic = v }
    fun setRange(v: String) { range = v; store.range = v }

    /** 這台主機目前選的時間範圍要畫的曲線；30 分鐘直接用即時資料 */
    fun histFor(h: Host): Hist? {
        if (range == "30m") return h.hist
        val k = h.key + "|" + range
        val c = hist[k]
        if ((c == null || System.currentTimeMillis() - c.first > 60_000) && histBusy.add(k)) {
            val a = api
            viewModelScope.launch {
                val r = runCatching { a?.history(h.node, range) }.getOrNull()
                hist[k] = System.currentTimeMillis() to (r ?: c?.second)
                histBusy.remove(k)
            }
        }
        return c?.second
    }
}
