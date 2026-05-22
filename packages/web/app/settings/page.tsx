import { ThemeSwitch } from "./theme-switch";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-muted">
          AI model routing, account, and storage settings will surface here as M11 / M15 land. For
          now: theme + sign-out.
        </p>
      </header>
      <section aria-labelledby="appearance" className="space-y-2">
        <h2 id="appearance" className="text-sm font-medium text-ink-muted">
          Appearance
        </h2>
        <ThemeSwitch />
      </section>
    </div>
  );
}
