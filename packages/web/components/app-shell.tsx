import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/notes", label: "Notes" },
  { href: "/search", label: "Search" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Primary"
        className="hidden w-56 shrink-0 border-r border-ink/10 bg-surface-muted p-4 md:block dark:border-ink-inverse/10 dark:bg-surface-inverse/40"
      >
        <div className="mb-6 text-lg font-semibold">Notes</div>
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm hover:bg-ink/5 dark:hover:bg-ink-inverse/10"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
