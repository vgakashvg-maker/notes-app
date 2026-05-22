package app.notes.android.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * SSE event types emitted by `supabase/functions/ai/chat`. Kotlin twin of
 * `packages/web/lib/chat/sse.ts` — keep the shapes byte-identical so
 * both clients consume the same M09 event contract.
 */
sealed class ChatEvent {
    data class Chunk(val delta: String) : ChatEvent()
    data class Citation(
        val noteId: String,
        val title: String,
        val chunkIndex: Int,
        val rank: Int,
    ) : ChatEvent()
    data class Warning(val message: String) : ChatEvent()
    data class Done(
        val conversationId: String,
        val tokens: Int,
        val model: String,
        val latencyMs: Long,
    ) : ChatEvent()
    data class Error(val message: String) : ChatEvent()
}

/**
 * Stateful parser for the SSE byte stream. `feed(text)` returns events
 * extracted from any complete frames in the running buffer; the remainder
 * is held for the next call (network framing has no obligation to align
 * with `\n\n`). `flush()` drains a trailing un-terminated event.
 */
class SseParser(private val json: Json = DEFAULT_JSON) {
    private var buffer: String = ""

    fun feed(text: String): List<ChatEvent> {
        buffer += text
        val out = mutableListOf<ChatEvent>()
        var sep = buffer.indexOf(SEP)
        while (sep != -1) {
            val raw = buffer.substring(0, sep)
            buffer = buffer.substring(sep + SEP.length)
            parseFrame(raw)?.let(out::add)
            sep = buffer.indexOf(SEP)
        }
        return out
    }

    fun flush(): List<ChatEvent> {
        val tail = buffer.trim()
        buffer = ""
        if (tail.isEmpty()) return emptyList()
        return listOfNotNull(parseFrame(tail))
    }

    private fun parseFrame(raw: String): ChatEvent? {
        var event = "message"
        val dataLines = mutableListOf<String>()
        for (line in raw.split("\n")) {
            when {
                line.startsWith(":") -> Unit // SSE comment
                line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                line.startsWith("data:") -> dataLines.add(line.removePrefix("data:").trim())
            }
        }
        if (dataLines.isEmpty()) return null
        val element = runCatching { json.parseToJsonElement(dataLines.joinToString("\n")) }
            .getOrNull() ?: return null
        if (element !is JsonObject) return null
        return toChatEvent(event, element)
    }

    private fun toChatEvent(event: String, data: JsonObject): ChatEvent? = when (event) {
        "chunk" -> data.string("delta")?.let { ChatEvent.Chunk(it) }
        "citation" -> {
            val noteId = data.string("noteId")
            val title = data.string("title")
            val chunkIndex = data.int("chunkIndex")
            val rank = data.int("rank")
            if (noteId != null && title != null && chunkIndex != null && rank != null) {
                ChatEvent.Citation(noteId, title, chunkIndex, rank)
            } else null
        }
        "warning" -> data.string("message")?.let { ChatEvent.Warning(it) }
        "done" -> {
            val cid = data.string("conversationId")
            val tokens = data.int("tokens")
            val model = data.string("model")
            val latency = data.long("latencyMs")
            if (cid != null && tokens != null && model != null && latency != null) {
                ChatEvent.Done(cid, tokens, model, latency)
            } else null
        }
        "error" -> data.string("message")?.let { ChatEvent.Error(it) }
        else -> null
    }

    private fun JsonObject.string(key: String): String? =
        (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.int(key: String): Int? =
        (get(key) as? JsonPrimitive)?.content?.toIntOrNull()

    private fun JsonObject.long(key: String): Long? =
        (get(key) as? JsonPrimitive)?.content?.toLongOrNull()

    private companion object {
        const val SEP = "\n\n"
        val DEFAULT_JSON: Json = Json { ignoreUnknownKeys = true; isLenient = true }
    }
}

