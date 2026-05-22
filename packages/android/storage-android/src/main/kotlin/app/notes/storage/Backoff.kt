package app.notes.storage

import kotlin.math.min
import kotlin.random.Random

/**
 * Full-jitter exponential backoff. Mirrors the TS twin. Adapters classify
 * retriable errors; this only schedules the waits.
 */
data class BackoffConfig(
    val maxAttempts: Int = 3,
    val baseDelayMs: Long = 300,
    val maxDelayMs: Long = 5_000,
    val delay: suspend (Long) -> Unit = ::defaultDelay,
    val random: () -> Double = { Random.nextDouble() },
)

internal suspend fun defaultDelay(ms: Long) {
    kotlinx.coroutines.delay(ms)
}

suspend fun <T> retry(
    op: suspend () -> T,
    shouldRetry: (Throwable) -> Boolean,
    config: BackoffConfig = BackoffConfig(),
): T {
    var attempt = 0
    while (true) {
        try {
            return op()
        } catch (err: Throwable) {
            attempt += 1
            if (attempt > config.maxAttempts || !shouldRetry(err)) throw err
            val base = min(config.baseDelayMs * (1L shl (attempt - 1)), config.maxDelayMs)
            val wait = (config.random() * base).toLong().coerceAtLeast(0)
            config.delay(wait)
        }
    }
}
