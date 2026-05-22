package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class AITest {
    @Test
    fun `AIMessage rejects empty content`() {
        assertThrows(IllegalArgumentException::class.java) { AIMessage(MessageRole.USER, "") }
    }

    @Test
    fun `AIOptions rejects out-of-range temperature`() {
        assertThrows(IllegalArgumentException::class.java) {
            AIOptions(model = "qwen2.5:7b", temperature = 3.0)
        }
    }

    @Test
    fun `AIOptions accepts a sane configuration`() {
        val o = AIOptions(model = "qwen2.5:7b", temperature = 0.4, maxTokens = 1000)
        assertEquals("qwen2.5:7b", o.model)
    }

    @Test
    fun `MessageRole fromWire round-trips`() {
        assertEquals(MessageRole.SYSTEM, MessageRole.fromWire("system"))
        assertEquals(MessageRole.ASSISTANT, MessageRole.fromWire("assistant"))
        assertEquals(null, MessageRole.fromWire("unknown"))
    }

    @Test
    fun `ModelDescriptor rejects zero contextTokens`() {
        assertThrows(IllegalArgumentException::class.java) {
            ModelDescriptor(id = "m", contextTokens = 0, supports = emptySet())
        }
    }
}
