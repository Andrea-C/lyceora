import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

/**
 * The product's acceptance test: the full recovery-path happy flow, driven through a real
 * Chromium browser against the real Next app, with LYCEORA_FAKE_MODELS=1 (see
 * playwright.config.ts / apps/web/src/server/registry.ts) so it needs no provider API keys.
 *
 * Diagnostic-answering strategy: the fake assessor's fixed exercise always has correctAnswer "8"
 * (packages/agents/src/fake.ts). Answering the FIRST diagnostic question wrong (deliberately, per
 * Task 17's brief) and every subsequent one correctly guarantees the diagnostic finishes with
 * exactly one target topic left un-mastered — which in turn guarantees the daily session's
 * composed plan contains a fresh "new topic" block (a lesson followed by exercises), so the
 * session step below always has both a lesson item and a gradeable item to complete, regardless
 * of exactly how many questions the diagnostic itself asks (bounded, but not a fixed count — see
 * packages/engine/src/diagnostic.ts).
 *
 * Both loops below key off a visible, monotonically-changing on-page counter (the diagnostic's
 * "Domanda N", the session's "<kind> · N/total") rather than generic testid visibility: after
 * submitting an answer, the OLD exercise card stays mounted (same testid) until the server
 * responds and React re-renders with the next question/item, so polling on testid visibility
 * alone races ahead and re-fills/re-submits the stale card. Waiting for the counter to actually
 * advance (or the terminal screen to appear) makes each step wait for the real transition.
 */
test("signup -> diagnostic -> session -> teacher chat -> locale switch (fake models, no API keys)", async ({ page }) => {
  const email = `e2e-${randomUUID()}@lyceora.test`;
  const password = "correct horse battery staple";
  const childDisplayName = "Marco";
  const DIAGNOSTIC_DONE = "Fatto! Il tuo percorso è pronto.";

  // --- signup ---
  await page.goto("/it");
  await page.getByRole("button", { name: "Crea account" }).click(); // toggle login -> signup mode
  await page.getByLabel("Nome").fill("Genitore Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Crea account", exact: true }).click(); // submit
  await page.waitForURL(/\/it\/app\/profiles$/);

  // --- create + pick child profile ---
  await page.getByLabel("Nome").fill(childDisplayName);
  await page.getByTestId("profile-create").click();
  await expect(page.getByTestId("profile-pick")).toBeVisible();
  await page.getByTestId("profile-pick").click();
  await page.waitForURL(/\/it\/app$/);

  // --- dashboard: no enrollment yet, start the diagnostic ---
  await page.getByTestId("start-diagnostic").click();
  await page.waitForURL(/\/it\/app\/diagnostic$/);

  let questionNumber = 0;
  for (;;) {
    questionNumber += 1;
    const step = await waitForDiagnosticQuestion(page, questionNumber, DIAGNOSTIC_DONE);
    if (step === "done") { questionNumber -= 1; break; }
    await page.getByTestId("exercise-input").fill(questionNumber === 1 ? "0" : "8"); // first wrong, rest correct
    await page.getByTestId("exercise-submit").click();
  }
  await expect(page.getByText(DIAGNOSTIC_DONE)).toBeVisible();
  expect(questionNumber).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Torna alla home" }).click();
  await page.waitForURL(/\/it\/app$/);

  // --- dashboard: enrollment active, path progress visible ---
  await expect(page.getByText("Progresso del percorso")).toBeVisible();

  // --- dashboard: "Primi passi" badge earned from the diagnostic (full-color, not muted) ---
  const primiPassiBadge = page.getByText("Primi passi", { exact: true }).locator("xpath=ancestor::li[1]");
  await expect(primiPassiBadge).not.toHaveClass(/opacity-40/);

  // --- daily session: lesson item (+ teacher chat) and at least one gradeable exercise item ---
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/it\/app\/session$/);

  let sawLesson = false;
  let sawExercise = false;
  let engagedTeacher = false;
  let previousStatus: string | null = null;
  for (;;) {
    const step = await waitForSessionTransition(page, previousStatus);
    if (step === "done") break;
    previousStatus = await currentSessionStatus(page);

    if (step === "lesson") {
      sawLesson = true;
      if (!engagedTeacher) {
        await page.getByTestId("teacher-input").fill("Come si risolve 2 alla terza?");
        await page.getByTestId("teacher-send").click();
        // fixed fake-teacher reply (packages/agents/src/fake.ts), streamed through the real
        // AG-UI SSE encoder (apps/web/src/server/registry.ts's teacherStream)
        await expect(page.getByText(/maestro di prova/)).toBeVisible({ timeout: 15_000 });
        engagedTeacher = true;
      }
      await page.getByTestId("session-next").click();
      continue;
    }

    // review / exercise / assessment item — the fake assessor's answer is always "8"
    await page.getByTestId("exercise-input").fill("8");
    await page.getByTestId("exercise-submit").click();
    const feedback = page.getByTestId("exercise-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("Giusto!");
    sawExercise = true;
    await page.getByTestId("session-next").click(); // advance — status text doesn't change until this fires
  }

  expect(sawLesson).toBe(true);
  expect(sawExercise).toBe(true);
  expect(engagedTeacher).toBe(true);
  await expect(page.getByText(/Sessione completata/)).toBeVisible();

  // --- back to dashboard: XP increased ---
  await page.getByRole("link", { name: "Torna alla home" }).click();
  await page.waitForURL(/\/it\/app$/);
  const xpAfterSession = await readXpValue(page);
  expect(xpAfterSession).toBeGreaterThan(0);

  // --- locale switch: English dashboard strings ---
  await page.getByTestId("locale-switch").click();
  await page.waitForURL(/\/en\/app$/);
  await expect(page.getByText("XP today")).toBeVisible();
});

/** Waits for the diagnostic's "Domanda N" counter to show the expected question number (exact
 * match — "Domanda 1" is a text substring of "Domanda 10..19"), or for the done screen. */
async function waitForDiagnosticQuestion(page: Page, expectedNumber: number, doneText: string): Promise<"asking" | "done"> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await page.getByText(doneText).isVisible().catch(() => false)) return "done";
    if (await page.getByText(`Domanda ${expectedNumber}`, { exact: true }).isVisible().catch(() => false)) return "asking";
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for diagnostic question ${expectedNumber} or the done screen.`);
}

/** The session runner's own "<kind> · index/total" status line (session-client.tsx) — a stable,
 * visible signal that only changes when the plan actually advances to a new item. */
async function currentSessionStatus(page: Page): Promise<string | null> {
  const el = page.locator("p").filter({ hasText: /\d+\/\d+/ }).first();
  return (await el.isVisible().catch(() => false)) ? await el.innerText() : null;
}

/** Waits until the session's status line differs from `previousStatus` (a real item transition
 * happened), or the session-done screen appears, then reports what kind of step is now showing. */
async function waitForSessionTransition(page: Page, previousStatus: string | null): Promise<"lesson" | "exercise" | "done"> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await page.getByText(/Sessione completata/).isVisible().catch(() => false)) return "done";
    const status = await currentSessionStatus(page);
    if (status !== null && status !== previousStatus) {
      if (await page.getByTestId("exercise-input").isVisible().catch(() => false)) return "exercise";
      if (await page.getByTestId("session-next").isVisible().catch(() => false)) return "lesson";
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Timed out waiting for the next session step to render.");
}

async function readXpValue(page: Page): Promise<number> {
  const text = await page.getByTestId("xp-value").innerText();
  return Number(text.trim());
}
