import Link from "next/link";
import type { ReactNode } from "react";

const TABS = [
  { href: "/settings/ai/endpoint", label: "Endpoint" },
  { href: "/settings/ai/routing", label: "Routing" },
  { href: "/settings/ai/usage", label: "Usage" },
] as const;

export default function AISettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">AI</h1>
        <p className="text-sm text-ink-muted">
          Configure the local Ollama box, pick a model per task, and review usage.
        </p>
      </header>
      <nav aria-label="AI settings sections" className="flex gap-1 border-b border-ink/10">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-t-md px-3 py-2 text-sm hover:bg-ink/5 dark:hover:bg-ink-inverse/10"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <section>{children}</section>
    </div>
  );
}
