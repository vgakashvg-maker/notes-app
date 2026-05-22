package app.notes.android.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the current Supabase access token in a hot StateFlow so the
 * auth-gate composable can react to sign-in / sign-out. The token is
 * persisted to [SessionTokenStore] so it survives process death; this
 * holder is the in-memory view of it.
 *
 * The full SupabaseAuthAdapter session lifecycle (OAuth flow, refresh,
 * expiry) lands when M16-equivalent wires the Custom Tabs flow + Ktor
 * SupabaseAuthHttp impl. For M12 the holder is the seam — sign-in pastes
 * a JWT, sign-out clears it.
 */
@Singleton
class AuthStateHolder @Inject constructor(
    private val store: SessionTokenStore,
) {
    private val state = MutableStateFlow(store.read())

    val token: StateFlow<String?> = state.asStateFlow()

    fun signedIn(): Boolean = state.value?.isNotBlank() == true

    fun setToken(jwt: String) {
        store.write(jwt)
        state.value = jwt
    }

    fun clear() {
        store.clear()
        state.value = null
    }
}
