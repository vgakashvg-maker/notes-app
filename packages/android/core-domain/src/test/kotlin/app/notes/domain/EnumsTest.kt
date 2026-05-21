package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class EnumsTest {
    @Test
    fun `StorageProviderId catalogue`() {
        assertEquals(listOf("GOOGLE_DRIVE", "ONEDRIVE"), StorageProviderId.all.map { it.wireName })
    }

    @Test
    fun `StorageProviderId fromWireName round-trips`() {
        assertSame(StorageProviderId.GoogleDrive, StorageProviderId.fromWireName("GOOGLE_DRIVE"))
    }

    @Test
    fun `StorageProviderId fromWireName rejects unknown values`() {
        assertThrows(IllegalArgumentException::class.java) {
            StorageProviderId.fromWireName("DROPBOX")
        }
    }

    @Test
    fun `AIProviderId catalogue includes Ollama`() {
        assert(AIProviderId.all.contains(AIProviderId.Ollama))
    }

    @Test
    fun `SyncStatus Idle is the singleton`() {
        assertSame(SyncStatus.Idle, SyncStatus.Idle)
    }

    @Test
    fun `SyncStatus Syncing rejects negative item counts`() {
        assertThrows(IllegalArgumentException::class.java) {
            SyncStatus.Syncing(SyncDirection.UP, -1)
        }
    }

    @Test
    fun `SyncStatus Error rejects blank messages`() {
        assertThrows(IllegalArgumentException::class.java) {
            SyncStatus.Error("   ", true)
        }
    }

    @Test
    fun `SyncStatus Conflict carries the offending NoteId`() {
        val noteId = NoteId("550e8400-e29b-41d4-a716-446655440001")
        val status = SyncStatus.Conflict(noteId)
        assertEquals(noteId, status.noteId)
    }
}
