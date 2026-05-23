// Shared CORS shim for every supabase/functions/* handler. Browsers
// preflight cross-origin requests via OPTIONS; without a 204 response
// the browser blocks the actual POST before it reaches the function.
// We also merge CORS response headers into every concrete response
// (success + thrown 500) so the browser exposes the body to JS.

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

export const CORS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
});

function withCorsHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Drop-in replacement for `Deno.serve` that:
 *   1. Short-circuits OPTIONS preflights with a 204 + CORS headers.
 *   2. Wraps the handler's response with CORS headers (including SSE).
 *   3. Catches unhandled throws and surfaces them as JSON with CORS
 *      so the browser can read the error.
 */
export function corsServe(
  handler: (req: Request) => Response | Promise<Response>,
): void {
  Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      const res = await handler(req);
      return withCorsHeaders(res);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Internal error";
      return withCorsHeaders(
        new Response(
          JSON.stringify({ ok: false, error: { code: "ERR_INTERNAL", message } }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
  });
}
