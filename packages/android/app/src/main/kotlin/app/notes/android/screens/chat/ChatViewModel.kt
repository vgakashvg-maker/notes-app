package app.notes.android.screens.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.notes.android.auth.AuthStateHolder
import app.notes.android.chat.ChatEvent
import app.notes.android.chat.ChatStreamSource
import app.notes.android.chat.CitationEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val text: String = "",
    val citations: Map<String, CitationEntry> = emptyMap(),
    val warnings: List<String> = emptyList(),
    val error: String? = null,
    val pending: Boolean = false,
    val conversationId: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val source: ChatStreamSource,
    private val auth: AuthStateHolder,
) : ViewModel() {
    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    fun send(message: String) {
        val jwt = auth.token.value
        if (jwt.isNullOrBlank()) {
            _state.update { it.copy(error = "Sign in first.") }
            return
        }
        _state.update { it.copy(text = "", warnings = emptyList(), error = null, pending = true) }
        viewModelScope.launch {
            runCatching {
                source.stream(jwt, message, _state.value.conversationId).collect(::reduce)
            }.onFailure { cause ->
                _state.update { it.copy(error = cause.message ?: "chat failed", pending = false) }
            }
        }
    }

    private fun reduce(event: ChatEvent) {
        _state.update { s ->
            when (event) {
                is ChatEvent.Chunk -> s.copy(text = s.text + event.delta)
                is ChatEvent.Citation -> s.copy(
                    citations = s.citations + (event.noteId to CitationEntry(event.noteId, event.title, event.rank)),
                )
                is ChatEvent.Warning -> s.copy(warnings = s.warnings + event.message)
                is ChatEvent.Done -> s.copy(pending = false, conversationId = event.conversationId)
                is ChatEvent.Error -> s.copy(error = event.message, pending = false)
            }
        }
    }
}
