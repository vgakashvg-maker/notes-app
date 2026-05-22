package app.notes.storage

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.atomic.AtomicInteger

class BackoffTest {
    @Test
    fun `returns the result on the first attempt`() = runTest {
        val calls = AtomicInteger(0)
        val result = retry(
            op = { calls.incrementAndGet(); "ok" },
            shouldRetry = { true },
            config = BackoffConfig(baseDelayMs = 0, maxDelayMs = 0, delay = { _ -> }, random = { 0.0 }),
        )
        assertEquals("ok", result)
        assertEquals(1, calls.get())
    }

    @Test
    fun `retries up to maxAttempts then throws`() = runTest {
        val calls = AtomicInteger(0)
        val ex = runCatching {
            retry<Unit>(
                op = { calls.incrementAndGet(); throw RuntimeException("transient") },
                shouldRetry = { true },
                config = BackoffConfig(baseDelayMs = 0, maxDelayMs = 0, delay = { _ -> }, random = { 0.0 }),
            )
        }
        assertTrue(ex.isFailure)
        assertEquals(4, calls.get())
    }

    @Test
    fun `does not retry when shouldRetry is false`() = runTest {
        val calls = AtomicInteger(0)
        runCatching {
            retry<Unit>(
                op = { calls.incrementAndGet(); throw RuntimeException("hard") },
                shouldRetry = { false },
                config = BackoffConfig(baseDelayMs = 0, maxDelayMs = 0, delay = { _ -> }, random = { 0.0 }),
            )
        }
        assertEquals(1, calls.get())
    }

    @Test
    fun `delays scale exponentially and cap at maxDelayMs`() = runTest {
        val delays = mutableListOf<Long>()
        val config = BackoffConfig(
            maxAttempts = 4,
            baseDelayMs = 1000,
            maxDelayMs = 1500,
            delay = { ms -> delays.add(ms) },
            random = { 0.99 },
        )
        runCatching {
            retry<Unit>(
                op = { throw RuntimeException("transient") },
                shouldRetry = { true },
                config = config,
            )
        }
        assertEquals(4, delays.size)
        assertTrue(delays.all { it <= 1500 })
    }
}
