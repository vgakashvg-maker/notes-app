package app.notes.android.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SseParserTest {

    @Test fun `parses a single chunk event`() {
        val p = SseParser()
        val events = p.feed("event: chunk\ndata: {\"delta\":\"hi\"}\n\n")
        assertEquals(listOf(ChatEvent.Chunk("hi")), events)
    }

    @Test fun `survives bytes split mid-event`() {
        val p = SseParser()
        assertEquals(emptyList<ChatEvent>(), p.feed("event: chunk\ndata: "))
        assertEquals(emptyList<ChatEvent>(), p.feed("{\"delta\":\"ab"))
        assertEquals(listOf(ChatEvent.Chunk("ab")), p.feed("\"}\n\n"))
    }

    @Test fun `delivers two events in one frame`() {
        val p = SseParser()
        val events = p.feed(
            "event: chunk\ndata: {\"delta\":\"a\"}\n\n" +
                "event: chunk\ndata: {\"delta\":\"b\"}\n\n",
        )
        assertEquals(
            listOf(ChatEvent.Chunk("a"), ChatEvent.Chunk("b")),
            events,
        )
    }

    @Test fun `parses citation events with full payload`() {
        val p = SseParser()
        val events = p.feed(
            "event: citation\ndata: {\"noteId\":\"abc-123\"," +
                "\"title\":\"Notes\",\"chunkIndex\":2,\"rank\":1}\n\n",
        )
        assertEquals(
            listOf(ChatEvent.Citation("abc-123", "Notes", 2, 1)),
            events,
        )
    }

    @Test fun `parses warning and done events`() {
        val p = SseParser()
        val events = p.feed(
            "event: warning\ndata: {\"message\":\"truncated\"}\n\n" +
                "event: done\ndata: {\"conversationId\":\"c1\"," +
                "\"tokens\":42,\"model\":\"qwen\",\"latencyMs\":1200}\n\n",
        )
        assertEquals(
            listOf(
                ChatEvent.Warning("truncated"),
                ChatEvent.Done("c1", 42, "qwen", 1200),
            ),
            events,
        )
    }

    @Test fun `parses error events`() {
        val p = SseParser()
        assertEquals(
            listOf(ChatEvent.Error("boom")),
            p.feed("event: error\ndata: {\"message\":\"boom\"}\n\n"),
        )
    }

    @Test fun `ignores SSE comments and unknown events`() {
        val p = SseParser()
        val events = p.feed(
            ": keep-alive\n\n" +
                "event: mystery\ndata: {\"x\":1}\n\n" +
                "event: chunk\ndata: {\"delta\":\"ok\"}\n\n",
        )
        assertEquals(listOf(ChatEvent.Chunk("ok")), events)
    }

    @Test fun `drops frames with malformed JSON rather than throwing`() {
        val p = SseParser()
        assertEquals(
            emptyList<ChatEvent>(),
            p.feed("event: chunk\ndata: {not json}\n\n"),
        )
    }

    @Test fun `flush returns a trailing un-terminated event`() {
        val p = SseParser()
        assertEquals(
            emptyList<ChatEvent>(),
            p.feed("event: chunk\ndata: {\"delta\":\"a\"}"),
        )
        assertEquals(listOf(ChatEvent.Chunk("a")), p.flush())
    }
}
