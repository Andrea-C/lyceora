import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile } from "@lyceora/db";
import { eq } from "drizzle-orm";
import { setDailyXpGoal } from "../src/server/services/settings";

let db: never;
let ownerUserId: string;
let profileId: string;

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  ownerUserId = "parent";
  await d.insert(user).values({ id: ownerUserId, name: "P", email: "p@x.it", emailVerified: false });
  const [p] = await d.insert(profile).values({ ownerUserId, displayName: "Marco" }).returning();
  profileId = p!.id;
  db = d as never;
});

describe("setDailyXpGoal", () => {
  it("updates within bounds and rejects outside", async () => {
    await setDailyXpGoal(db, ownerUserId, profileId, 50);
    expect((await db.select().from(profile).where(eq(profile.id, profileId)))[0]!.dailyXpGoal).toBe(50);
    await expect(setDailyXpGoal(db, ownerUserId, profileId, 5)).rejects.toThrow(/between/i);
    await expect(setDailyXpGoal(db, ownerUserId, profileId, 500)).rejects.toThrow(/between/i);
    await expect(setDailyXpGoal(db, "other-user", profileId, 50)).rejects.toThrow();
  });
});
