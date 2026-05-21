package app.notes.auth

import app.notes.domain.CalendarProviderId
import app.notes.domain.ExternalProviderId
import app.notes.domain.StorageProviderId
import app.notes.domain.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SupabaseAuthAdapterTest {
    private val userId = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val session = StoredSession(
        userId = userId,
        accessToken = "jwt-abc",
        refreshToken = "rt-abc",
        expiresAtEpochSeconds = 9_999_999_999,
    )
    private val profile = UserProfileRow(
        userId = userId,
        displayName = "Vgaka",
        storageProvider = StorageProviderId.GoogleDrive,
        calendarProvider = CalendarProviderId.GoogleCalendar,
        aiPrefs = UserProfileRow.defaultPrefs(),
        analyticsOptOut = false,
    )

    @Test
    fun `signInWithGoogle stores session and returns Success`() = runTest {
        val http = FakeHttp(oauth = OAuthOutcome.Authenticated(session), profile = profile)
        val store = FakeStore()
        val adapter = SupabaseAuthAdapter(http, store)
        val result = adapter.signInWithGoogle()
        assertTrue(result is AuthResult.Success)
        assertEquals("Vgaka", (result as AuthResult.Success).user.displayName)
        assertEquals(session, store.current())
        assertEquals(listOf(GoogleScopes.REQUIRED), http.scopesRequested)
    }

    @Test
    fun `signInWithGoogle maps cancellation`() = runTest {
        val http = FakeHttp(oauth = OAuthOutcome.Cancelled("user closed tab"))
        val adapter = SupabaseAuthAdapter(http, FakeStore())
        val result = adapter.signInWithGoogle()
        assertTrue(result is AuthResult.Cancelled)
    }

    @Test
    fun `signInWithGoogle maps failure`() = runTest {
        val http = FakeHttp(oauth = OAuthOutcome.Failed("boom", null))
        val adapter = SupabaseAuthAdapter(http, FakeStore())
        val result = adapter.signInWithGoogle()
        assertTrue(result is AuthResult.Error)
    }

    @Test
    fun `signInWithGoogle returns Error when profile row missing`() = runTest {
        val http = FakeHttp(oauth = OAuthOutcome.Authenticated(session), profile = null)
        val adapter = SupabaseAuthAdapter(http, FakeStore())
        val result = adapter.signInWithGoogle()
        assertTrue(result is AuthResult.Error)
    }

    @Test
    fun `signOut clears the session and notifies subscribers`() = runTest {
        val http = FakeHttp(oauth = OAuthOutcome.Authenticated(session), profile = profile)
        val store = FakeStore(initial = session)
        val adapter = SupabaseAuthAdapter(http, store)
        adapter.signInWithGoogle()

        val seen = mutableListOf<String?>()
        adapter.subscribeToUser { seen.add(it?.displayName) }
        adapter.signOut()

        assertNull(store.current())
        assertEquals(listOf("Vgaka", null), seen)
    }

    @Test
    fun `subscribeToUser fires the current snapshot immediately`() {
        val adapter = SupabaseAuthAdapter(FakeHttp(), FakeStore())
        val seen = mutableListOf<String?>()
        adapter.subscribeToUser { seen.add(it?.displayName) }
        assertEquals(listOf<String?>(null), seen)
    }

    @Test
    fun `accessToken returns the stored JWT`() = runTest {
        val store = FakeStore(initial = session)
        val adapter = SupabaseAuthAdapter(FakeHttp(), store)
        assertEquals("jwt-abc", adapter.accessToken())
    }

    @Test
    fun `providerAccessToken proxies via http when JWT is available`() = runTest {
        val http = FakeHttp(refreshedToken = "ya29.fresh")
        val adapter = SupabaseAuthAdapter(http, FakeStore(initial = session))
        val token = adapter.providerAccessToken(ExternalProviderId.GoogleDrive)
        assertEquals("ya29.fresh", token)
    }

    @Test
    fun `providerAccessToken returns null without a session`() = runTest {
        val http = FakeHttp(refreshedToken = "ya29.fresh")
        val adapter = SupabaseAuthAdapter(http, FakeStore())
        assertNull(adapter.providerAccessToken(ExternalProviderId.GoogleDrive))
    }

    @Test
    fun `OAuthOutcome rejects blank reasons`() {
        assertThrows(IllegalArgumentException::class.java) { OAuthOutcome.Cancelled("  ") }
        assertThrows(IllegalArgumentException::class.java) { OAuthOutcome.Failed(" ", null) }
    }

    @Test
    fun `AuthResult rejects blank messages`() {
        assertThrows(IllegalArgumentException::class.java) { AuthResult.Cancelled("") }
        assertThrows(IllegalArgumentException::class.java) { AuthResult.Error("  ", null) }
    }

    @Test
    fun `StoredSession enforces invariants`() {
        assertThrows(IllegalArgumentException::class.java) {
            StoredSession(userId, "", "rt", 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            StoredSession(userId, "jwt", "rt", 0)
        }
    }
}

private class FakeHttp(
    val oauth: OAuthOutcome = OAuthOutcome.Cancelled("not started"),
    val profile: UserProfileRow? = null,
    val refreshedToken: String? = null,
) : SupabaseAuthHttp {
    val scopesRequested = mutableListOf<List<String>>()
    var signOutCalls = 0

    override suspend fun startGoogleOAuth(scopes: List<String>): OAuthOutcome {
        scopesRequested.add(scopes)
        return oauth
    }

    override suspend fun signOut() {
        signOutCalls += 1
    }

    override suspend fun fetchUserProfile(userId: UserId, accessToken: String): UserProfileRow? =
        profile

    override suspend fun refreshProviderToken(jwt: String, provider: ExternalProviderId): String? =
        refreshedToken
}

private class FakeStore(initial: StoredSession? = null) : SessionStore {
    private var stored: StoredSession? = initial
    override suspend fun current(): StoredSession? = stored
    override suspend fun save(session: StoredSession) { stored = session }
    override suspend fun clear() { stored = null }
}
