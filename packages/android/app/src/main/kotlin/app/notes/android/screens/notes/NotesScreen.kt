package app.notes.android.screens.notes

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun NotesScreen(onOpen: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
    ) {
        Text("Notes")
        Text(
            "Notes-list wiring (Supabase REST → list rows → Compose lazy column) " +
                "lands when the SupabaseNotesAdapter binding does. For now this " +
                "screen lets you punch into the new-note editor.",
        )
        TextButton(onClick = { onOpen("new") }) { Text("New note →") }
    }
}
