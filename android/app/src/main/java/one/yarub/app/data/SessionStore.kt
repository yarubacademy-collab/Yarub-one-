package one.yarub.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Session storage.
 *
 * The session cookie is the user's identity, so it is held in
 * EncryptedSharedPreferences rather than plain preferences: on a rooted or
 * backed-up device, plain storage is readable. No credential beyond this cookie
 * is ever persisted — the password is never written to disk.
 */
class SessionStore(context: Context) {

    private val prefs: SharedPreferences = runCatching {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "yarub_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        ) as SharedPreferences
    }.getOrElse {
        // Some devices have a broken keystore. Falling back keeps the app
        // usable; the cookie is short-lived and server-revocable either way.
        context.getSharedPreferences("yarub_session_fallback", Context.MODE_PRIVATE)
    }

    fun cookie(): String? = prefs.getString(KEY_COOKIE, null)

    fun save(cookie: String) {
        prefs.edit().putString(KEY_COOKIE, cookie).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_COOKIE).apply()
    }

    fun isSignedIn(): Boolean = cookie() != null

    private companion object {
        const val KEY_COOKIE = "session_cookie"
    }
}
