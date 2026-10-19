package app.vpssentinel

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/* ═════════ 主機傳來的資料（跟網頁讀的是同一份 /api/all） ═════════ */

data class Disk(val path: String, val total: Long, val used: Long, val pct: Double)
data class Item(val name: String, val short: String, val group: String, val st: String, val state: String, val kind: String)
data class Event(val t: Long, val kind: String, val text: String, val host: String = "", val hostKey: String = "", val n: Int = 1)
data class Hist(val t: List<Long>, val cpu: List<Float>, val mem: List<Float>, val rx: List<Float>, val tx: List<Float>)
data class Traffic(val used: Long, val limit: Long, val pct: Double?, val projected: Long?, val resetDay: Int, val daysLeft: Int)

data class Host(
    val key: String, val node: String, val name: String, val online: Boolean, val level: String,
    val problems: List<String>, val notices: List<String>, val error: String, val lastSeen: Double?,
    val cc: String, val city: String, val org: String, val ip: String,
    val os: String, val kernel: String, val version: String, val uptime: Double,
    val cores: Int, val cpu: Double, val load: Double,
    val memPct: Double, val memUsed: Long, val memTotal: Long, val swapPct: Double, val swapTotal: Long,
    val disks: List<Disk>, val rx: Double, val tx: Double, val conns: Int?,
    val items: List<Item>, val events: List<Event>, val traffic: Traffic?, val hist: Hist?,
    val v6Addr: String?, val v6Ok: Boolean?, val hasV6: Boolean,
) {
    val disk0: Disk get() = disks.firstOrNull { it.path == "/" } ?: disks.firstOrNull() ?: Disk("/", 0, 0, 0.0)
}

class ApiError(val code: Int, msg: String) : Exception(msg)

private val STATE = mapOf(
    "running" to "執行中", "exited" to "已停止", "restarting" to "重啟中", "paused" to "暫停", "created" to "未啟動", "dead" to "故障",
    "active" to "執行中", "inactive" to "未執行", "failed" to "失敗", "activating" to "啟動中", "unknown" to "未知",
)

private fun JSONObject.str(k: String) = if (isNull(k)) "" else optString(k, "")
private fun JSONObject.num(k: String) = if (isNull(k)) 0.0 else optDouble(k, 0.0).let { if (it.isNaN()) 0.0 else it }
private fun JSONObject.numOrNull(k: String) = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }
private fun JSONArray?.strs() = if (this == null) emptyList() else (0 until length()).map { optString(it) }
private fun JSONArray?.floats() = if (this == null) emptyList() else (0 until length()).map { optDouble(it, 0.0).toFloat() }
private fun JSONArray?.objs() = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

fun parseHist(o: JSONObject?): Hist? {
    o ?: return null
    val t = o.optJSONArray("t")
    return Hist(if (t == null) emptyList() else (0 until t.length()).map { t.optLong(it) },
        o.optJSONArray("cpu").floats(), o.optJSONArray("mem").floats(), o.optJSONArray("rx").floats(), o.optJSONArray("tx").floats())
}

/* 容器和服務排成同一串：同一組放一起，壞掉的排前面（跟網頁一樣） */
private fun itemsOf(o: JSONObject): List<Item> {
    val out = mutableListOf<Item>()
    for (c in o.optJSONArray("containers").objs()) {
        val status = c.str("status"); val state = c.str("state"); val name = c.str("name")
        val st = when {
            "unhealthy" in status -> "bad"
            state == "running" -> "ok"
            state == "created" || state == "paused" || "Exited (0)" in status -> "off"
            else -> "bad"
        }
        val g = c.str("project")
        val short = if (g.isNotEmpty() && name.startsWith("$g-")) name.substring(g.length + 1) else name
        out += Item(name, short, g, st, STATE[state] ?: state, "容器")
    }
    val rank = mapOf("bad" to 0, "ok" to 1, "off" to 2)
    out.sortWith(compareBy<Item>({ it.group.isEmpty() }, { it.group }, { rank[it.st] }, { it.short }))
    for (v in o.optJSONArray("services").objs()) {
        val state = v.str("state")
        out += Item(v.str("name"), v.str("name"), "系統服務", if (state == "active") "ok" else "bad", STATE[state] ?: state, "服務")
    }
    return out
}

fun parseHost(o: JSONObject): Host {
    val node = o.str("node"); val name = o.str("name").ifEmpty { node }
    val geo = o.optJSONObject("geo"); val mem = o.optJSONObject("mem") ?: JSONObject()
    val net = o.optJSONObject("net") ?: JSONObject(); val v6 = o.optJSONObject("ipv6")
    val tr = o.optJSONObject("traffic"); val load = o.optJSONArray("load")
    val online = o.optBoolean("online", false)
    return Host(
        key = node.ifEmpty { name }, node = node, name = name, online = online,
        level = o.str("level").ifEmpty { if (online) "ok" else "bad" },
        problems = o.optJSONArray("problems").strs(), notices = o.optJSONArray("notices").strs(),
        error = o.str("error"), lastSeen = o.numOrNull("last_seen"),
        cc = geo?.str("cc").orEmpty(), city = geo?.str("city").orEmpty(), org = geo?.str("org").orEmpty(), ip = geo?.str("ip").orEmpty(),
        os = o.str("os"), kernel = o.str("kernel"), version = o.str("version"), uptime = o.num("uptime"),
        cores = o.optInt("cores", 1).coerceAtLeast(1), cpu = o.num("cpu"), load = load?.optDouble(0, 0.0) ?: 0.0,
        memPct = mem.num("pct"), memUsed = mem.optLong("used"), memTotal = mem.optLong("total"),
        swapPct = mem.num("swap_pct"), swapTotal = mem.optLong("swap_total"),
        disks = o.optJSONArray("disks").objs().map { Disk(it.str("path"), it.optLong("total"), it.optLong("used"), it.num("pct")) },
        rx = net.num("rx"), tx = net.num("tx"), conns = if (o.isNull("conns") || !o.has("conns")) null else o.optInt("conns"),
        items = itemsOf(o),
        events = o.optJSONArray("events").objs().map { Event(it.optLong("t"), it.str("kind"), it.str("text"), name, node.ifEmpty { name }) },
        traffic = tr?.let {
            Traffic(it.optLong("used"), it.optLong("limit"), it.numOrNull("pct"), it.numOrNull("projected")?.toLong(),
                it.optInt("reset_day", 1), it.optInt("days_left"))
        },
        hist = parseHist(o.optJSONObject("hist")),
        v6Addr = v6?.str("addr")?.ifEmpty { null }, v6Ok = if (v6 == null || v6.isNull("ok")) null else v6.optBoolean("ok"), hasV6 = v6 != null,
    )
}

/* ═════════ 連線 ═════════ */

class Api(val base: String, val token: String) {

    suspend fun all(): List<Host> {
        val a = JSONArray(get("/api/all"))
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map(::parseHost)
    }

    suspend fun history(node: String, range: String): Hist =
        parseHist(JSONObject(get("/api/history?range=$range&node=" + java.net.URLEncoder.encode(node, "UTF-8"))))
            ?: throw ApiError(0, "讀取失敗")

    private suspend fun get(path: String) = call(base, path, token = token)

    companion object {
        /** 網址整理成 https://網域:埠；貼上安裝完成時的連結（#t=密碼）也可以 */
        fun clean(raw: String): Pair<String, String?> {
            var u = raw.trim()
            var tok: String? = null
            Regex("#t=([^&\\s]+)").find(u)?.let { tok = java.net.URLDecoder.decode(it.groupValues[1], "UTF-8") }
            u = u.substringBefore('#').substringBefore('?')
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://$u"
            return u.trimEnd('/') to tok
        }

        /** 登入：PIN 碼先換成密碼，再確認密碼能用；成功回傳密碼 */
        suspend fun login(base: String, input: String): String {
            var token = input
            if (Regex("^\\d{4,8}$").matches(input)) {
                val has = runCatching { JSONObject(call(base, "/api/passkey-login", body = """{"action":"has"}""")) }.getOrNull()
                if (has?.optBoolean("pin") == true) {
                    try {
                        token = JSONObject(call(base, "/api/pin-login", body = JSONObject().put("pin", input).toString())).optString("token")
                    } catch (e: ApiError) {
                        throw if (e.code == 401) ApiError(401, e.message ?: "PIN 碼不對") else e
                    }
                }
            }
            try {
                call(base, "/api/status", token = token)
            } catch (e: ApiError) {
                throw if (e.code == 401) ApiError(401, "密碼不對") else if (e.code == 404) ApiError(404, "這個網址不是 VPS 哨兵") else e
            }
            return token
        }

        suspend fun call(base: String, path: String, token: String? = null, body: String? = null): String = withContext(Dispatchers.IO) {
            val c = try {
                URL(base + path).openConnection() as HttpURLConnection
            } catch (e: Exception) {
                throw ApiError(0, "網址不對")
            }
            try {
                c.connectTimeout = 8000
                c.readTimeout = 20000
                c.setRequestProperty("Accept", "application/json")
                if (token != null) c.setRequestProperty("X-Token", token)
                if (body != null) {
                    c.requestMethod = "POST"
                    c.doOutput = true
                    c.setRequestProperty("Content-Type", "application/json")
                    c.outputStream.use { it.write(body.toByteArray()) }
                }
                val code = c.responseCode
                val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (code >= 400) {
                    val msg = runCatching { JSONObject(text).let { it.optString("message").ifEmpty { it.optString("error") } } }.getOrNull()
                    throw ApiError(code, msg?.ifEmpty { null } ?: "主機回應錯誤（$code）")
                }
                text
            } catch (e: ApiError) {
                throw e
            } catch (e: UnknownHostException) {
                throw ApiError(0, "找不到這個網域")
            } catch (e: SocketTimeoutException) {
                throw ApiError(0, "等太久沒有回應")
            } catch (e: SSLException) {
                throw ApiError(0, "加密憑證有問題")
            } catch (e: IOException) {
                throw ApiError(0, "連不上主機")
            } finally {
                c.disconnect()
            }
        }
    }
}
