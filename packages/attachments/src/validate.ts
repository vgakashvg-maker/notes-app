/**
 * Pure-logic backing for the `attachments/validate` Edge Function. Scans
 * pages of `attachments_refs`, checks each row against storage, and
 * collects 404s into `dangling_attachments` for user review.
 *
 * Run daily via pg_cron — the migration `20260522123000_dangling_attachments.sql`
 * wires the schedule.
 */

export interface ValidatorDeps {
  /** Fetch the next page of rows; null cursor for the first page. */
  readonly fetchPage: (cursor: string | null) => Promise<ValidationPageLite>;
  /** Probe a single external id; returns 'present' | 'missing' | 'error'. */
  readonly probe: (externalId: string) => Promise<ProbeResult>;
  /** Persist a dangling entry. Implementations should be idempotent. */
  readonly recordDangling: (entry: DanglingRecord) => Promise<void>;
}

export interface ValidationPageLite {
  readonly rows: readonly ValidatorRow[];
  readonly nextCursor: string | null;
}

export interface ValidatorRow {
  readonly id: string;
  readonly external_id: string;
  readonly thumbnail_id: string | null;
  readonly owner_id: string;
}

export type ProbeResult = "present" | "missing" | "error";

export interface DanglingRecord {
  readonly attachmentId: string;
  readonly ownerId: string;
  readonly externalId: string;
  readonly missingOriginal: boolean;
  readonly missingThumbnail: boolean;
}

export interface ValidatorSummary {
  readonly scanned: number;
  readonly dangling: number;
  readonly probeErrors: number;
}

export async function runValidator(deps: ValidatorDeps): Promise<ValidatorSummary> {
  let scanned = 0;
  let dangling = 0;
  let probeErrors = 0;
  let cursor: string | null = null;
  do {
    const page: ValidationPageLite = await deps.fetchPage(cursor);
    for (const row of page.rows) {
      scanned += 1;
      const originalProbe = await deps.probe(row.external_id);
      let thumbnailProbe: ProbeResult = "present";
      if (row.thumbnail_id !== null) {
        thumbnailProbe = await deps.probe(row.thumbnail_id);
      }
      if (originalProbe === "error" || thumbnailProbe === "error") {
        probeErrors += 1;
        // Do NOT record as dangling on probe error — could be a 503; we
        // want the validator to be safe to re-run.
        continue;
      }
      const missingOriginal = originalProbe === "missing";
      const missingThumbnail = thumbnailProbe === "missing";
      if (missingOriginal || missingThumbnail) {
        dangling += 1;
        await deps.recordDangling({
          attachmentId: row.id,
          ownerId: row.owner_id,
          externalId: row.external_id,
          missingOriginal,
          missingThumbnail,
        });
      }
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  return { scanned, dangling, probeErrors };
}
