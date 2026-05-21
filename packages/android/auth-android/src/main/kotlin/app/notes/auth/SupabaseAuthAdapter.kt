package app.notes.auth

import app.notes.domain.AIPreferences
import app.notes.domain.AIProviderId
import app.notes.domain.CalendarProviderId
import app.notes.domain.ExternalProviderId
import app.notes.domain.StorageProviderId
import app.notes.domain.User
import app.notes.domain.UserId
import java.util.concurrent.CopyOnWriteArrayList

/**
 * V1 implementation of [AuthProvider] that talks to Supabase via a small,
 * dependency-injected HTTP port ([SupabaseAuthHttp]) and persists the
 * session through a [SessionStore]. The Android wiring (Chrome Custom Tabs
 * intent launch, EncryptedSharedPreferences-backed SessionStore, real Ktor
 * client) lands in M12 — keeping it out of this module means the adapter
 * stays pure-Kotlin and JUnit-testable on the JVM.
 */
class SupabaseAuthAdapter(
    private val http: SupabaseAuthHttp,
    private val sessions: SessionStore,
) : AuthProvider {
    private val listeners = CopyOnWriteArrayList<(User?) -> Unit>()

    @Volatile
    private var cachedUser: User? = null

    override suspend fun signInWithGoogle(): AuthResult {
        val outcome = http.startGoogleOAuth(GoogleScopes.REQUIRED)
        when (outcome) {
            is OAuthOutcome.Cancelled -> return AuthResult.Cancelled(outcome.reason)
            is OAuthOutcome.Failed ->
                return AuthResult.Error(outcome.message, outcome.cause)
            is OAuthOutcome.Authenticated -> {
                sessions.save(outcome.session)
                val profile = http.fetchUserProfile(outcome.session.userId, outcome.session.accessToken)
                    ?: return AuthResult.Error("users_profile row not found for ${outcome.session.userId}", null)
                val user = profile.toUser()
                setUser(user)
                return AuthResult.Success(user)
            }
        }
    }

    override suspend fun signOut() {
        http.signOut()
        sessions.clear()
        setUser(null)
    }

    override fun currentUser(): User? = cachedUser

    override fun subscribeToUser(listener: (User?) -> Unit): Unsubscribe {
        listeners.add(listener)
        listener(cachedUser)
        return Unsubscribe { listeners.remove(listener) }
    }

    override suspend fun accessToken(): String? = sessions.current()?.accessToken

    override suspend fun providerAccessToken(provider: ExternalProviderId): String? {
        val jwt = accessToken() ?: return null
        return http.refreshProviderToken(jwt, provider)
    }

    private fun setUser(user: User?) {
        if (cachedUser == user) return
        cachedUser = user
        for (listener in listeners) {
            listener(user)
        }
    }
}

/** Plug for the Supabase HTTP surface; the real Ktor impl lands in M12. */
interface SupabaseAuthHttp {
    suspend fun startGoogleOAuth(scopes: List<String>): OAuthOutcome
    suspend fun signOut()
    suspend fun fetchUserProfile(userId: UserId, accessToken: String): UserProfileRow?
    suspend fun refreshProviderToken(jwt: String, provider: ExternalProviderId): String?
}

/** Plug for session persistence; M12 wires EncryptedSharedPreferences. */
interface SessionStore {
    suspend fun current(): StoredSession?
    suspend fun save(session: StoredSession)
    suspend fun clear()
}

sealed class OAuthOutcome {
    data class Authenticated(val session: StoredSession) : OAuthOutcome()
    data class Cancelled(val reason: String) : OAuthOutcome() {
        init { require(reason.isNotBlank()) { "OAuthOutcome.Cancelled.reason cannot be empty" } }
    }
    data class Failed(val message: String, val cause: Throwable?) : OAuthOutcome() {
        init { require(message.isNotBlank()) { "OAuthOutcome.Failed.message cannot be empty" } }
    }
}

data class StoredSession(
    val userId: UserId,
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
) {
    init {
        require(accessToken.isNotBlank()) { "StoredSession.accessToken cannot be empty" }
        require(refreshToken.isNotBlank()) { "StoredSession.refreshToken cannot be empty" }
        require(expiresAtEpochSeconds > 0) { "StoredSession.expiresAtEpochSeconds must be positive" }
    }
}

data class UserProfileRow(
    val userId: UserId,
    val displayName: String,
    val storageProvider: StorageProviderId?,
    val calendarProvider: CalendarProviderId?,
    val aiPrefs: AIPreferences,
    val analyticsOptOut: Boolean,
) {
    fun toUser(): User = User(
        userId = userId,
        displayName = displayName,
        storageProvider = storageProvider,
        calendarProvider = calendarProvider,
        aiPrefs = aiPrefs,
        analyticsOptOut = analyticsOptOut,
    )

    companion object {
        fun defaultPrefs(): AIPreferences = AIPreferences(
            chatProvider = AIProviderId.Ollama,
            chatModel = "qwen2.5:7b",
            tagProvider = AIProviderId.Ollama,
            tagModel = "llama3.2:3b",
            embeddingProvider = AIProviderId.Ollama,
            embeddingModel = "nomic-embed-text",
        )
    }
}
