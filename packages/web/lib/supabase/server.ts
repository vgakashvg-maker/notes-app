import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client bound to the current request's cookie jar.
 *
 * Uses anon key + RLS — every read/write is scoped to the signed-in user.
 * The auth/Supabase boundary lives in @notes-app/auth; this file is only
 * the Next.js binding to that port.
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {
        // Server components cannot set cookies; middleware handles refresh.
      },
      remove() {
        // Same: middleware owns mutations.
      },
    },
  });
}
