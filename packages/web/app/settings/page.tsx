import Link from "next/link";
import { ThemeSwitch } from "./theme-switch";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-muted">
          Appearance, AI routing, and account. Notifications + storage land with M11 + M03 wiring.
        </p>
      </header>
      <section aria-labelledby="appearance" className="space-y-2">
        <h2 id="appearance" className="text-sm font-medium text-ink-muted">
          Appearance
        </h2>
        <ThemeSwitch />
      </section>
      <section aria-labelledby="ai" className="space-y-2">
        <h2 id="ai" className="text-sm font-medium text-ink-muted">
          AI
        </h2>
        <ul className="divide-y divide-ink/5">
          {[
            {
              href: "/settings/ai/endpoint",
              label: "Endpoint",
              hint: "Ollama URL + connection test",
            },
            { href: "/settings/ai/routing", label: "Routing", hint: "Pick a model per task" },
            { href: "/settings/ai/usage", label: "Usage", hint: "Tokens + latency, last 14 days" },
          ].map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                className="flex items-baseline justify-between gap-4 py-3 hover:underline"
              >
                <span className="text-sm font-medium">{row.label}</span>
                <span className="text-xs text-ink-muted">{row.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
