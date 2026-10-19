package app.vpssentinel

import android.content.Context

/* 記住主機網址（登入狀態由網頁自己記） */
class Store(ctx: Context) {
    private val p = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE).also { it.edit().remove("tok").apply() }   // 舊版存的密碼不用了

    var url: String
        get() = p.getString("url", "").orEmpty()
        set(v) = p.edit().putString("url", v).apply()
}
