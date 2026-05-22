package app.notes.android.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * EncryptedSharedPreferences-backed token store. Holds only the Supabase
 * access token (JWT) for V1 — full SupabaseAuthAdapter session wiring
 * (refresh + expiry) lands when the Custom Tabs OAuth flow does.
 */
class SessionTokenStore(context: Context) {
    private val prefs by lazy {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "notes_session",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun read(): String? = prefs.getString(KEY_JWT, null)?.takeIf { it.isNotBlank() }

    fun write(jwt: String) {
        prefs.edit().putString(KEY_JWT, jwt).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_JWT).apply()
    }

    private companion object {
        const val KEY_JWT = "supabase_jwt"
    }
}
