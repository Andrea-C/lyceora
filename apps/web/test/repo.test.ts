import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile } from "@lyceora/db";
import { getOwnedProfile, ForbiddenError } from "../src/server/repo";

let db: never;
let profileA: { id: string };

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values([
    { id: "parentA", name: "A", email: "a@x.it", emailVerified: false },
    { id: "parentB", name: "B", email: "b@x.it", emailVerified: false }
  ]);
  [profileA] = await d.insert(profile).values({ ownerUserId: "parentA", displayName: "Marco" }).returning();
  db = d as never;
});

describe("tenant isolation", () => {
  it("returns the profile to its owner", async () => {
    const p = await getOwnedProfile(db, "parentA", profileA.id);
    expect(p.displayName).toBe("Marco");
  });
  it("throws ForbiddenError for any other user", async () => {
    await expect(getOwnedProfile(db, "parentB", profileA.id)).rejects.toThrow(ForbiddenError);
  });
});
