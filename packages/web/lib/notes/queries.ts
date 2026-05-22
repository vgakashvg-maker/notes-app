import { getSupabaseServerClient } from "../supabase/server";

/**
 * Note-list row used by the Next.js shells. This is the framework's binding
 * to PostgREST and lives alongside the route code — the broader
 * NotesService port (in @notes-app/notes) is reserved for non-framework
 * consumers (sync engine, AI services, …) so that swapping Supabase
 * still only touches adapter modules.
 */
export interface NoteListRow {
  id: string;
  title: string;
  updated_at: string;
  is_pinned: boolean;
}

export async function listRecentNotes(limit = 50): Promise<NoteListRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,updated_at,is_pinned")
    .eq("is_trashed", false)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error !== null) return [];
  return (data ?? []) as NoteListRow[];
}

export async function getNoteById(
  id: string,
): Promise<{ id: string; title: string; body_json: string; updated_at: string } | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,body_json,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return data as { id: string; title: string; body_json: string; updated_at: string };
}
