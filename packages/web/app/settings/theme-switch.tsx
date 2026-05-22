"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = ["light", "dark", "system"] as const;

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Avoid hydration mismatch — next-themes resolves on the client.
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <div className="flex items-center gap-1 text-xs">
      {OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setTheme(opt)}
          aria-pressed={theme === opt}
          className={
            "rounded px-2 py-1 capitalize " +
            (theme === opt ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-ink/5")
          }
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
