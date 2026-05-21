package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ExternalProviderIdTest {
    @Test
    fun `catalogue lists the V1 external providers in canonical order`() {
        assertEquals(
            listOf("GOOGLE_DRIVE", "GOOGLE_CALENDAR", "GOOGLE_USERINFO"),
            ExternalProviderId.all.map { it.wireName },
        )
    }

    @Test
    fun `fromWireName round-trips`() {
        assertSame(ExternalProviderId.GoogleDrive, ExternalProviderId.fromWireName("GOOGLE_DRIVE"))
    }

    @Test
    fun `fromWireName rejects unknown values`() {
        assertThrows(IllegalArgumentException::class.java) {
            ExternalProviderId.fromWireName("DROPBOX")
        }
    }
}
