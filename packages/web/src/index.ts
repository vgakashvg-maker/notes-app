import { APP_NAME } from "@notes-app/shared";
import { initSentry } from "./observability/sentry.js";
import { initPostHog } from "./observability/posthog.js";

export function bootstrap(env: NodeJS.ProcessEnv = process.env): { app: string } {
  initSentry({ dsn: env.SENTRY_DSN_WEB, environment: env.APP_ENV });
  initPostHog({
    key: env.POSTHOG_KEY,
    host: env.POSTHOG_HOST,
    analyticsOptOut: env.ANALYTICS_OPTOUT === "true",
  });
  return { app: APP_NAME };
}
