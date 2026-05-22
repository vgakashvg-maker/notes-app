package app.notes.android.screens.editor

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Minimal editor — title + free-form body. Mirrors the web shell's
 * "minimal Tiptap" posture: the Compose-native rich editor that bridges
 * the M06 ProseMirror schema is a follow-up module. Persistence wiring
 * (Supabase REST insert + the notes_stamp_owner trigger that just landed)
 * waits on the NotesService binding.
 */
@Composable
fun EditorScreen(noteId: String) {
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
    ) {
        Text(if (noteId == "new") "New note" else "Note $noteId")
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("Title") },
            modifier = Modifier.fillMaxSize().padding(top = 8.dp, bottom = 8.dp),
            singleLine = true,
        )
        OutlinedTextField(
            value = body,
            onValueChange = { body = it },
            label = { Text("Body") },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
