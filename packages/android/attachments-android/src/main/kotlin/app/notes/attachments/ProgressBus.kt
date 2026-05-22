package app.notes.attachments

import app.notes.domain.Progress
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import java.util.concurrent.ConcurrentHashMap

/**
 * Pub/sub keyed by attachment id (or a client-side temporary id used
 * before the AttachmentRef exists). Mirrors the TS `ProgressBus`. The
 * last value per id is replayed to late subscribers.
 */
class ProgressBus {
    private data class Event(val id: String, val value: Progress)

    private val latest = ConcurrentHashMap<String, Progress>()
    private val flow = MutableSharedFlow<Event>(extraBufferCapacity = 64)

    fun publish(id: String, value: Progress) {
        latest[id] = value
        flow.tryEmit(Event(id, value))
    }

    fun current(id: String): Progress? = latest[id]

    fun subscribe(id: String): Flow<Progress> =
        flow
            .filter { it.id == id }
            .map { it.value }
            .onStart {
                latest[id]?.let { emit(it) }
            }
}
