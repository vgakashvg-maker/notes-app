package app.notes.android.chat

import io.ktor.client.HttpClient
import io.ktor.client.plugins.timeout
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.headers
import io.ktor.client.request.preparePost
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Streams `ai/chat` SSE events for a given user message. Pure Ktor +
 * coroutines — UI layer collects the Flow and renders. Uses the [SseParser]
 * which is shared with the Kotlin twin tests.
 */
class ChatStreamSource(
    private val http: HttpClient,
    private val supabaseUrl: String,
    private val json: Json,
) {
    fun stream(
        jwt: String,
        message: String,
        conversationId: String? = null,
    ): Flow<ChatEvent> = flow {
        if (message.isBlank()) return@flow
        val parser = SseParser(json)
        http.preparePost("$supabaseUrl/functions/v1/ai/chat") {
            applyRequest(jwt, message, conversationId)
        }.execute { response ->
            val channel: ByteReadChannel = response.bodyAsChannel()
            val buf = ByteArray(8 * 1024)
            while (!channel.isClosedForRead) {
                val read = channel.readAvailable(buf, 0, buf.size)
                if (read <= 0) continue
                val text = buf.decodeToString(0, read)
                for (event in parser.feed(text)) emit(event)
            }
            for (event in parser.flush()) emit(event)
        }
    }

    private fun HttpRequestBuilder.applyRequest(
        jwt: String,
        message: String,
        conversationId: String?,
    ) {
        contentType(ContentType.Application.Json)
        headers {
            append(HttpHeaders.Authorization, "Bearer $jwt")
            append(HttpHeaders.Accept, "text/event-stream")
        }
        timeout { requestTimeoutMillis = 5 * 60_000 }
        setBody(buildPayload(message, conversationId))
    }

    private fun buildPayload(message: String, conversationId: String?): JsonObject =
        buildJsonObject {
            put("message", message)
            if (conversationId != null) put("conversationId", conversationId)
        }
}

