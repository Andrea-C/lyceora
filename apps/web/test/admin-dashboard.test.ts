import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, learningSession, masteryState, xpEvent } from "@lyceora/db";
import { getAdminDashboard } from "../src/server/services/admin";

let db: never;

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values([
    { id: "admin-userA", name: "A", email: "a@test.dev", emailVerified: false },
    { id: "admin-userB", name: "B", email: "b@test.dev", emailVerified: false }
  ]);
  const [profileA] = await d.insert(profile).values({ ownerUserId: "admin-userA", displayName: "Nora" }).returning();
  await d.insert(profile).values({ ownerUserId: "admin-userB", displayName: "Leo" }).returning();

  // user A's profile: a completed diagnostic session, mastery rows, and XP
  await d.insert(learningSession).values({ profileId: profileA!.id, kind: "diagnostic", status: "completed" });
  await d.insert(masteryState).values([
    { profileId: profileA!.id, topicId: "topicA", status: "mastered" },
    { profileId: profileA!.id, topicId: "topicB", status: "inProgress" }
  ]);
  await d.insert(xpEvent).values({ profileId: profileA!.id, reason: "lessonComplete", amount: 20 });

  db = d as never;
});

describe("getAdminDashboard", () => {
  it("aggregates counters and per-profile stages", async () => {
    const d = await getAdminDashboard(db);
    expect(d.counters.users).toBe(2);
    expect(d.counters.profiles).toBe(2);

    const a = d.users.find((u) => u.email === "a@test.dev")!;
    expect(a.profiles[0]!.diagnosticDone).toBe(true);
    expect(a.profiles[0]!.mastered).toBeGreaterThan(0);

    const b = d.users.find((u) => u.email === "b@test.dev")!;
    expect(b.profiles[0]!.diagnosticDone).toBe(false);
  });
});
