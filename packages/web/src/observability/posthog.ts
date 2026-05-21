export interface PostHogInitOptions {
  key: string | undefined;
  host?: string | undefined;
  analyticsOptOut: boolean;
}

export interface PostHogClient {
  enabled: boolean;
  host: string;
  optedOut: boolean;
}

const DEFAULT_HOST = "https://us.i.posthog.com";

export function initPostHog(options: PostHogInitOptions): PostHogClient {
  const host = options.host ?? DEFAULT_HOST;
  if (options.analyticsOptOut) {
    return { enabled: false, host, optedOut: true };
  }
  if (!options.key || options.key.trim().length === 0) {
    return { enabled: false, host, optedOut: false };
  }
  return { enabled: true, host, optedOut: false };
}
