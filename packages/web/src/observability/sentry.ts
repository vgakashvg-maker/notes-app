export interface SentryInitOptions {
  dsn: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
}

export interface SentryClient {
  enabled: boolean;
  environment: string;
  release: string | undefined;
}

export function initSentry(options: SentryInitOptions): SentryClient {
  const environment = options.environment ?? "development";
  if (!options.dsn || options.dsn.trim().length === 0) {
    return { enabled: false, environment, release: options.release };
  }
  // Real SDK wiring lands when the Next.js app is introduced in M06; until
  // then we record the intent so init failures are easy to detect.
  return { enabled: true, environment, release: options.release };
}
