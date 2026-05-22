package app.notes.android.di

import android.content.Context
import app.notes.android.BuildConfig
import app.notes.android.auth.SessionTokenStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.serialization.json.Json

/**
 * App-level Hilt graph. One module per concern keeps the wiring legible
 * and makes adapter swaps a single-file change. Each port that depends on
 * a yet-to-be-built module (calendar, notifications, full sync) gets a
 * `// TODO M0X — wire <concrete> when that module lands` comment that
 * grep keeps honest.
 */

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SupabaseUrl

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SupabaseAnonKey

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    @SupabaseUrl
    fun provideSupabaseUrl(): String = BuildConfig.SUPABASE_URL

    @Provides
    @Singleton
    @SupabaseAnonKey
    fun provideSupabaseAnonKey(): String = BuildConfig.SUPABASE_ANON_KEY

    @Provides
    @Singleton
    fun provideSessionTokenStore(@ApplicationContext ctx: Context): SessionTokenStore =
        SessionTokenStore(ctx)

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideHttpClient(json: Json): HttpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            requestTimeoutMillis = 60_000
            connectTimeoutMillis = 10_000
        }
    }
}
