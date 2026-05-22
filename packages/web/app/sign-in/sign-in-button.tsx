"use client";

import { useState } from "react";
import { GOOGLE_SCOPES } from "@notes-app/auth";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

export function SignInButton({ redirectTo }: { redirectTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", redirectTo);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: GOOGLE_SCOPES.join(" "),
        redirectTo: callback.toString(),
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg shadow-sm transition-opacity disabled:opacity-60"
      >
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
