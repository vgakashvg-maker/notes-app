package app.notes.android.screens.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.notes.android.calendar.CalendarRepository
import app.notes.android.calendar.TodayEventRow
import app.notes.android.nav.Destinations
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TodayUiState(
    val events: List<TodayEventRow> = emptyList(),
    val loading: Boolean = true,
    val syncing: Boolean = false,
    val syncNote: String? = null,
)

@HiltViewModel
class TodayViewModel @Inject constructor(
    private val repo: CalendarRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TodayUiState())
    val state: StateFlow<TodayUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val events = repo.listEventsToday()
            _state.update { it.copy(events = events, loading = false) }
        }
    }

    fun sync() {
        viewModelScope.launch {
            _state.update { it.copy(syncing = true, syncNote = null) }
            val ok = repo.triggerSync()
            _state.update {
                it.copy(
                    syncing = false,
                    syncNote = if (ok) "Synced with Google Calendar." else "Sync failed.",
                )
            }
            if (ok) refresh()
        }
    }
}

@Composable
fun TodayScreen(onNavigate: (String) -> Unit, viewModel: TodayViewModel = hiltViewModel()) {
    val ui by viewModel.state.collectAsState()
    val timeFmt = DateTimeFormatter.ofPattern("HH:mm")
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Today", style = MaterialTheme.typography.titleLarge)
        Text("Events", style = MaterialTheme.typography.titleSmall)
        if (ui.loading) {
            Text("Loading…", style = MaterialTheme.typography.bodySmall)
        } else if (ui.events.isEmpty()) {
            Text(
                "Nothing on the calendar today. Tap Sync to pull from Google.",
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            for (event in ui.events) {
                val start = OffsetDateTime.parse(event.startAt).toLocalTime().format(timeFmt)
                val end = OffsetDateTime.parse(event.endAt).toLocalTime().format(timeFmt)
                Text("$start – $end · ${event.title}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        OutlinedButton(onClick = viewModel::sync, enabled = !ui.syncing) {
            Text(if (ui.syncing) "Syncing…" else "Sync now")
        }
        ui.syncNote?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        Text("Shortcuts", style = MaterialTheme.typography.titleSmall)
        TextButton(onClick = { onNavigate(Destinations.NOTES) }) { Text("Notes →") }
        TextButton(onClick = { onNavigate(Destinations.CHAT) }) { Text("Chat →") }
        TextButton(onClick = { onNavigate(Destinations.SEARCH) }) { Text("Search →") }
        TextButton(onClick = { onNavigate(Destinations.SETTINGS) }) { Text("Settings →") }
    }
}
