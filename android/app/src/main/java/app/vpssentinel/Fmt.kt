package app.vpssentinel

import java.util.Calendar
import java.util.Locale
import kotlin.math.roundToInt

/* 數字、時間、地點，跟網頁寫法一樣 */

fun size(b0: Double): String {
    if (b0 <= 0) return "0 B"
    var b = b0; var i = 0
    val u = listOf("B", "KB", "MB", "GB", "TB")
    while (b >= 1024 && i < 4) { b /= 1024; i++ }
    return (if (b < 10 && i > 0) String.format(Locale.US, "%.1f", b) else b.roundToInt().toString()) + " " + u[i]
}
fun size(b: Long) = size(b.toDouble())
fun rate(b: Double) = size(b) + "/s"

fun up(s: Double): String {
    val d = (s / 86400).toInt(); val h = (s % 86400 / 3600).toInt(); val m = (s % 3600 / 60).toInt()
    return if (d > 0) "$d 天 $h 小時" else if (h > 0) "$h 小時 $m 分" else "$m 分鐘"
}

private fun cal(t: Long) = Calendar.getInstance().apply { timeInMillis = t * 1000 }
private fun sameDay(a: Calendar, b: Calendar) = a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)
fun hm(t: Long) = cal(t).let { String.format(Locale.US, "%02d:%02d", it.get(Calendar.HOUR_OF_DAY), it.get(Calendar.MINUTE)) }

fun ago(t: Long): String {
    val d = System.currentTimeMillis() / 1000 - t
    val c = cal(t); val now = Calendar.getInstance()
    return when {
        d < 45 -> "剛剛"
        d < 3570 -> "${maxOf(1, (d / 60.0).roundToInt())} 分鐘前"
        sameDay(c, now) -> "今天 ${hm(t)}"
        else -> "${c.get(Calendar.MONTH) + 1}/${c.get(Calendar.DAY_OF_MONTH)} ${hm(t)}"
    }
}

fun dayOf(t: Long): String {
    val c = cal(t); val now = Calendar.getInstance(); val y = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    return if (sameDay(c, now)) "今天" else if (sameDay(c, y)) "昨天" else "${c.get(Calendar.MONTH) + 1} 月 ${c.get(Calendar.DAY_OF_MONTH)} 日"
}

fun region(cc: String): String = if (Regex("^[A-Z]{2}$").matches(cc)) Locale("", cc).getDisplayCountry(Locale.TRADITIONAL_CHINESE).ifEmpty { cc } else cc
fun place(h: Host) = listOf(if (h.cc.isNotEmpty()) region(h.cc) else "", h.city).filter { it.isNotEmpty() }.joinToString(" ")

/** 國旗表情符號 */
fun flag(cc: String): String = if (Regex("^[A-Z]{2}$").matches(cc)) cc.map { String(Character.toChars(0x1F1E6 + (it - 'A'))) }.joinToString("") else ""

/** 75% 變橘、90% 變紅 */
fun tier(p: Double) = if (p >= 90) "bad" else if (p >= 75) "warn" else ""

fun loadWord(lr: Double) = when {
    lr < .7 -> "輕鬆" to ""
    lr < 1 -> "有點忙" to "warn"
    lr < 2 -> "忙碌" to "warn"
    else -> "超載" to "bad"
}

val WORD = mapOf("bad" to "異常", "warn" to "注意", "ok" to "恢復", "info" to "通知")

fun greet(): String {
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return if (h < 5) "夜深了" else if (h < 11) "早安" else if (h < 14) "午安" else if (h < 18) "下午好" else "晚安"
}

/** 一句話說完現在的狀況（跟網頁同一套說法） */
fun headline(list: List<Host>): String {
    data class Is(val h: Host, val t: String)
    val iss = list.flatMap { h -> if (!h.online) listOf(Is(h, "")) else (h.problems + h.notices).map { Is(h, it) } }
    val hosts = iss.map { it.h.key }.toSet()
    return when {
        list.isEmpty() -> "讀取中"
        iss.isEmpty() -> if (list.size > 1) "${list.size} 台主機都正常" else "主機一切正常"
        iss.size == 1 -> if (iss[0].t.isNotEmpty()) "${iss[0].h.name}・${iss[0].t}" else "${iss[0].h.name} 連不上"
        hosts.size == 1 -> "${iss[0].h.name} 有 ${iss.size} 件事要留意"
        else -> "${hosts.size} 台主機要留意"
    }
}

/** 同一件事反覆發生：只留最新一筆，標上次數 */
fun mergeEv(ev: List<Event>): List<Event> {
    val m = LinkedHashMap<String, Event>()
    for (e in ev) {
        val k = e.kind + ":" + e.text
        m[k] = m[k]?.let { it.copy(n = it.n + 1) } ?: e
    }
    return m.values.toList()
}

fun allEvents(list: List<Host>) = list.flatMap { mergeEv(it.events) }.sortedByDescending { it.t }
