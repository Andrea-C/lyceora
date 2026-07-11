import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import * as repo from "@/server/repo";

export async function getSessionOrRedirect(locale: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}`);
  return session;
}

/**
 * Resolves the active profile from the `lyceora_profile` cookie (set by the profiles page),
 * re-verified against ownership on every call — a stale/foreign cookie value sends the parent
 * back to the picker rather than leaking a 403 into a page render.
 */
export async function getActiveProfileOrRedirect(locale: string) {
  const session = await getSessionOrRedirect(locale);
  const profileId = (await cookies()).get("lyceora_profile")?.value;
  if (!profileId) redirect(`/${locale}/app/profiles`);

  try {
    const profile = await repo.getOwnedProfile(db, session.user.id, profileId);
    return { session, profile };
  } catch (err) {
    if (err instanceof repo.ForbiddenError) redirect(`/${locale}/app/profiles`);
    throw err;
  }
}
