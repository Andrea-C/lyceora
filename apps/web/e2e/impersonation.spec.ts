import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDb, user } from "@lyceora/db";
import { E2E_DB_PORT } from "./global-setup";

/**
 * Task 6 acceptance: the admin impersonation round trip — impersonate a parent account from the
 * admin dashboard, see the banner while browsing as them (ImpersonationBanner), stop
 * impersonating via its plain form POST (/api/admin/stop-impersonating), and land back on the
 * admin dashboard with the httpOnly lyceora_profile cookie cleared and the admin session
 * genuinely restored (not just logged out).
 *
 * There's no UI to self-promote to admin, so this promotes a freshly-signed-up account by
 * writing directly to the E2E run's own database (the same PGlite-over-Postgres-wire instance
 * global-setup.ts spins up for webServer) — the "psql-equivalent" step the task brief calls for,
 * done here with the same drizzle client apps/web's own lib/db.ts wraps (@lyceora/db#createDb).
 */
test("admin impersonates a parent, banner shows, stop-impersonating restores the admin session", async ({
  page,
  context
}) => {
  const adminEmail = `e2e-admin-${randomUUID()}@lyceora.test`;
  const targetEmail = `e2e-target-${randomUUID()}@lyceora.test`;
  const password = "correct horse battery staple";

  // --- target account: a real parent with one child profile, so the admin dashboard has a
  // user + profile card to impersonate / drill into ---
  await page.goto("/it");
  await signUp(page, "Genitore Target", targetEmail, password);
  await page.waitForURL(/\/it\/app\/profiles$/);
  await page.getByLabel("Nome").fill("Bimbo Target");
  await page.getByTestId("profile-create").click();
  await page.waitForURL(/\/it\/app$/);
  await logOut(page);

  // --- admin account: signs up as an ordinary parent first (defaultRole, per auth.ts) ---
  await page.goto("/it");
  await signUp(page, "Genitore Admin", adminEmail, password);
  await page.waitForURL(/\/it\/app\/profiles$/);

  // --- promote to admin directly in the DB ---
  const db = createDb(`postgres://postgres:postgres@localhost:${E2E_DB_PORT}/postgres`);
  await db.update(user).set({ role: "admin" }).where(eq(user.email, adminEmail));

  // --- admin dashboard: target shows up, impersonate them (scoped to their row — the admin's
  // own row also has an "Impersona" button) ---
  await page.goto("/it/app/admin");
  const targetRow = page.locator("li").filter({ hasText: targetEmail });
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole("button", { name: "Impersona" }).click();
  await page.waitForURL(/\/it\/app\/profiles$/);

  // --- banner visible while impersonating; names the CURRENT (impersonated) user ---
  await expect(page.getByText(`Stai impersonando ${targetEmail}`)).toBeVisible();

  // --- pick the target's own profile too, landing on their dashboard with the httpOnly
  // lyceora_profile cookie set — this lets the assertions below also confirm that cookie gets
  // cleared by the stop-impersonating route handler, not just the impersonation session ---
  await page.getByTestId("profile-pick").click();
  await page.waitForURL(/\/it\/app$/);
  await expect(page.getByText(`Stai impersonando ${targetEmail}`)).toBeVisible();
  const cookiesWhileImpersonating = await context.cookies();
  expect(cookiesWhileImpersonating.some((c) => c.name === "lyceora_profile")).toBe(true);

  // --- stop impersonating: the banner's plain form POST, no client JS ---
  await page.getByRole("button", { name: "Torna admin" }).click();
  await page.waitForURL(/\/it\/app\/admin$/);
  await expect(page.getByText(`Stai impersonando ${targetEmail}`)).not.toBeVisible();

  const cookiesAfterStop = await context.cookies();
  expect(cookiesAfterStop.some((c) => c.name === "lyceora_profile")).toBe(false);

  // --- admin session genuinely restored (not merely logged out): reload to rule out a stale
  // RSC cache, and requireAdminOrNotFound must still resolve ---
  await page.reload();
  await expect(targetRow).toBeVisible();
});

async function signUp(page: Page, name: string, email: string, password: string) {
  await page.getByRole("button", { name: "Crea account" }).click(); // toggle login -> signup mode
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Crea account", exact: true }).click(); // submit
}

async function logOut(page: Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Esci" }).click();
  await page.waitForURL(/\/it$/);
}
