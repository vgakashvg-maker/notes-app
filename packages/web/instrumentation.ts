// Next.js instrumentation hook — called once at server start-up.
// We delegate to the bootstrap() function so observability init stays
// adapter-agnostic; swapping Sentry/PostHog is a one-file change in
// src/observability/.
export async function register(): Promise<void> {
  const { bootstrap } = await import("./src/index.js");
  bootstrap();
}
