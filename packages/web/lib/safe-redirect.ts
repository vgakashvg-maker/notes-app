/**
 * BUG-015 — both /auth/callback (?next=) and /sign-in (?redirectTo=)
 * accept a caller-supplied path and `redirect()` to it. Without
 * validation, `?next=//evil.com/path` or `?next=https://evil.com`
 * sends a freshly-signed-in user to a hostile origin with the
 * Supabase session cookie still attached. Classic open-redirect.
 *
 * Rule: only accept a path that starts with a single `/` and is not
 * protocol-relative (`//`) or a backslash-smuggle (`/\evil.com`).
 * Anything else falls back to `/`. Hash + query fragments are
 * permitted; absolute URLs even on our own origin are not (the
 * router handles that uniformly).
 */
export function safeRedirectTarget(input: string | null | undefined): string {
  if (input === null || input === undefined) return "/";
  const trimmed = input.trim();
  if (trimmed.length === 0) return "/";
  // Must start with a literal forward slash.
  if (trimmed.charAt(0) !== "/") return "/";
  // Reject protocol-relative `//host/...` and `/\host` smuggles.
  if (trimmed.length > 1 && (trimmed.charAt(1) === "/" || trimmed.charAt(1) === "\\")) {
    return "/";
  }
  return trimmed;
}
