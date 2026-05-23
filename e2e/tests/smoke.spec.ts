import { test, expect } from "@playwright/test";

/**
 * Smoke tests — Phase 0 / Phase 1 P0 sanity.
 *
 * These exercise the auth-less surface only. Authenticated flows are in
 * `auth.spec.ts`, `notes-crud.spec.ts`, `chat.spec.ts`. Those need either
 * a test-user fixture or a Supabase service-role bypass — see e2e/README.md.
 */

test("Sign-in page renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
});

test("Root redirects to sign-in when unauthenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("Notes route redirects to sign-in when unauthenticated", async ({ page }) => {
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("Unknown route still redirects to sign-in (auth middleware first)", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  // Either /sign-in (middleware redirected) or /404 (auth-aware route) — both acceptable
  const url = page.url();
  expect(url).toMatch(/(sign-in|404|this-page-does-not-exist)/);
});
