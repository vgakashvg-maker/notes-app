import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * OAuth callback. Supabase redirects here with a `code` query param; we
 * exchange it for a session and drop the user back where they came from.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  if (code === null) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const res = NextResponse.redirect(new URL(next, req.url));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    },
  );
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error !== null) {
    return NextResponse.redirect(new URL("/sign-in?error=exchange", req.url));
  }
  // BUG-005: seed users_profile.ai_prefs.endpoints.OLLAMA from the
  // server-side OLLAMA_ENDPOINT_URL on first sign-in so the routing
  // dropdowns + chat path work immediately instead of showing the
  // "Set your Ollama endpoint first" warning.
  await seedDefaultOllamaEndpoint(supabase);
  return res;
}

async function seedDefaultOllamaEndpoint(
  supabase: ReturnType<typeof createServerClient>,
): Promise<void> {
  const defaultUrl = process.env.OLLAMA_ENDPOINT_URL ?? "";
  if (defaultUrl.trim().length === 0) return;
  const { data: profileRow } = await supabase
    .from("users_profile")
    .select("ai_prefs")
    .maybeSingle();
  if (profileRow === null) return;
  const aiPrefs = (profileRow.ai_prefs as Record<string, unknown> | null) ?? {};
  const endpoints =
    (aiPrefs.endpoints as Record<string, string> | undefined) ?? {};
  if (typeof endpoints.OLLAMA === "string" && endpoints.OLLAMA.trim().length > 0) {
    return; // Already set — don't overwrite the user's choice.
  }
  const nextPrefs = {
    ...aiPrefs,
    version: 1,
    endpoints: { ...endpoints, OLLAMA: defaultUrl },
  };
  await supabase
    .from("users_profile")
    .update({ ai_prefs: nextPrefs })
    .neq("user_id", "00000000-0000-0000-0000-000000000000");
}
