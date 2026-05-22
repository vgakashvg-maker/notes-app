import { getSupabaseServerClient } from "../supabase/server";

export interface TodayEventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  calendar_id: string;
}

/**
 * Fetches the caller's calendar events whose start_at falls inside
 * `[start, end)`. RLS scopes everything to the signed-in user.
 */
export async function listEventsInRange(
  startIso: string,
  endIso: string,
): Promise<TodayEventRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("events_mirror")
    .select("id,title,start_at,end_at,calendar_id")
    .gte("start_at", startIso)
    .lt("start_at", endIso)
    .order("start_at", { ascending: true });
  if (error !== null) return [];
  return (data ?? []) as TodayEventRow[];
}

/** Start-of-day / start-of-tomorrow in the caller's local zone, ISO. */
export function todayRange(now: Date = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
