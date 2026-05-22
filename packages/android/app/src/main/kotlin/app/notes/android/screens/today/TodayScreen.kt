package app.notes.android.screens.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.notes.android.nav.Destinations

@Composable
fun TodayScreen(onNavigate: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Today")
        Text("Calendar events surface here once M08 lands.")
        TextButton(onClick = { onNavigate(Destinations.NOTES) }) { Text("Notes →") }
        TextButton(onClick = { onNavigate(Destinations.CHAT) }) { Text("Chat →") }
        TextButton(onClick = { onNavigate(Destinations.SEARCH) }) { Text("Search →") }
        TextButton(onClick = { onNavigate(Destinations.SETTINGS) }) { Text("Settings →") }
    }
}
