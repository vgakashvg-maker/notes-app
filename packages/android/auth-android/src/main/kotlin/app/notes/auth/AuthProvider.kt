package app.notes.auth

import app.notes.domain.ExternalProviderId
import app.notes.domain.User

/**
 * Outcome of an interactive sign-in attempt. The Cancelled / Error split
 * lets UI distinguish "the user backed out of the OAuth flow" (no error
 * banner) from "the OAuth flow exploded" (show an error).
 */
sealed class AuthResult {
    data class Success(val user: User) : AuthResult()

    data class Cancelled(val reason: String) : AuthResult() {
        init { require(reason.isNotBlank()) { "AuthResult.Cancelled.reason cannot be empty" } }
    }

    data class Error(val message: String, val cause: Throwable?) : AuthResult() {
        init { require(message.isNotBlank()) { "AuthResult.Error.message cannot be empty" } }
    }
}

/** Handle returned by [AuthProvider.subscribeToUser]; cancels the subscription. */
fun interface Unsubscribe {
    fun cancel()
}

/**
 * The auth port. Concrete adapters live in this module
 * ([SupabaseAuthAdapter]); consumers receive an instance via DI. Swapping
 * providers means writing a new adapter against this interface.
 */
interface AuthProvider {
    suspend fun signInWithGoogle(): AuthResult
    suspend fun signOut()
    fun currentUser(): User?
    fun subscribeToUser(listener: (User?) -> Unit): Unsubscribe
    suspend fun accessToken(): String?
    suspend fun providerAccessToken(provider: ExternalProviderId): String?
}

object GoogleScopes {
    val REQUIRED: List<String> = listOf(
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    )
}
