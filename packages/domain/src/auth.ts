/**
 * External OAuth providers whose access tokens we refresh on behalf of the
 * user. Lives in the domain layer because storage (M03) and calendar (M08)
 * adapters need to name the same provider when asking the auth module for a
 * fresh token — without taking a dependency on the auth module itself.
 *
 * Note: this is distinct from `StorageProviderId` / `CalendarProviderId` —
 * those name the *abstract* provider a user can pick (e.g. "I want my
 * attachments stored in Google Drive"), while `ExternalProviderId` names a
 * specific OAuth scope bundle the auth module manages tokens for.
 */
export type ExternalProviderId = "GOOGLE_DRIVE" | "GOOGLE_CALENDAR" | "GOOGLE_USERINFO";

export const ExternalProviderIds: readonly ExternalProviderId[] = [
  "GOOGLE_DRIVE",
  "GOOGLE_CALENDAR",
  "GOOGLE_USERINFO",
];
