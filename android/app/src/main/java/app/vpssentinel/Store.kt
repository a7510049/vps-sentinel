package app.vpssentinel

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/* 記住主機網址和密碼；密碼用手機內建的金鑰庫加密，別的 App 讀不到 */
class Store(ctx: Context) {
    private val p = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE)

    var url: String
        get() = p.getString("url", "").orEmpty()
        set(v) = p.edit().putString("url", v).apply()

    var token: String
        get() = p.getString("tok", null)?.let { runCatching { open(it) }.getOrNull() }.orEmpty()
        set(v) = p.edit().putString("tok", if (v.isEmpty()) null else seal(v)).apply()

    var refresh: Int
        get() = p.getInt("refresh", 5)
        set(v) = p.edit().putInt("refresh", v).apply()

    var dynamic: Boolean
        get() = p.getBoolean("dynamic", false)
        set(v) = p.edit().putBoolean("dynamic", v).apply()

    var range: String
        get() = p.getString("range", "30m").orEmpty()
        set(v) = p.edit().putString("range", v).apply()

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        return g.generateKey()
    }

    private fun seal(s: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(c.iv + c.doFinal(s.toByteArray()), Base64.NO_WRAP)
    }

    private fun open(s: String): String {
        val b = Base64.decode(s, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b, 0, 12)) }
        return String(c.doFinal(b, 12, b.size - 12))
    }

    private companion object { const val ALIAS = "vs-token" }
}
