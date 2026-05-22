package app.notes.android.di

import app.notes.android.chat.ChatStreamSource
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import javax.inject.Singleton
import kotlinx.serialization.json.Json

@Module
@InstallIn(SingletonComponent::class)
object ChatModule {
    @Provides
    @Singleton
    fun provideChatStreamSource(
        http: HttpClient,
        @SupabaseUrl supabaseUrl: String,
        json: Json,
    ): ChatStreamSource = ChatStreamSource(http, supabaseUrl, json)
}
