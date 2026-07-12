import type { Db } from "@lyceora/db";
import { profile } from "@lyceora/db";
import { eq } from "drizzle-orm";
import * as repo from "../repo";

export const XP_GOAL_MIN = 10;
export const XP_GOAL_MAX = 200;

export async function setDailyXpGoal(db: Db, userId: string, profileId: string, goal: number): Promise<void> {
  const p = await repo.getOwnedProfile(db, userId, profileId);
  if (!Number.isInteger(goal) || goal < XP_GOAL_MIN || goal > XP_GOAL_MAX) {
    throw new repo.ConflictError(`dailyXpGoal must be between ${XP_GOAL_MIN} and ${XP_GOAL_MAX}`);
  }
  await db.update(profile).set({ dailyXpGoal: goal }).where(eq(profile.id, p.id));
}
