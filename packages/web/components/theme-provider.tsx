"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps, ReactNode } from "react";

type NextThemesProviderProps = ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({
  children,
  ...props
}: NextThemesProviderProps & { children: ReactNode }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
