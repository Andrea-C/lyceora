import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { profile } from "@lyceora/db";
import { getSessionOrRedirect } from "@/lib/session";

export default async function ProfilesPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSessionOrRedirect(locale);
  const t = await getTranslations("profiles");

  const profiles = await db.select().from(profile).where(eq(profile.ownerUserId, session.user.id));

  async function createProfile(formData: FormData) {
    "use server";
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (!displayName) return;
    const birthYearRaw = formData.get("birthYear");
    const n = Number(birthYearRaw);
    const birthYear = birthYearRaw && Number.isInteger(n) && n >= 2005 && n <= 2022 ? n : undefined;

    const parentSession = await getSessionOrRedirect(locale);
    await db.insert(profile).values({
      ownerUserId: parentSession.user.id,
      displayName,
      birthYear,
      locale: locale === "en" ? "en" : "it"
    });
    revalidatePath(`/${locale}/app/profiles`);
  }

  async function selectProfile(formData: FormData) {
    "use server";
    const profileId = String(formData.get("profileId") ?? "");
    if (!profileId) return;

    const parentSession = await getSessionOrRedirect(locale);
    const [owned] = await db
      .select()
      .from(profile)
      .where(and(eq(profile.id, profileId), eq(profile.ownerUserId, parentSession.user.id)));
    if (!owned) return;

    const cookieStore = await cookies();
    cookieStore.set("lyceora_profile", profileId, {
      httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production"
    });
    redirect(`/${locale}/app`);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      {profiles.length > 0 && (
        <ul className="flex flex-col gap-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <form action={selectProfile}>
                <input type="hidden" name="profileId" value={p.id} />
                <button
                  type="submit"
                  data-testid="profile-pick"
                  className="w-full rounded-md border border-black/[.1] px-4 py-3 text-left transition-colors hover:bg-black/[.03] dark:border-white/[.15] dark:hover:bg-white/[.05]"
                >
                  {p.displayName}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={createProfile}
        className="flex flex-col gap-4 rounded-md border border-black/[.1] p-4 dark:border-white/[.15]"
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("displayName")}
          <input
            name="displayName"
            required
            className="rounded-md border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("birthYear")}
          <input
            name="birthYear"
            type="number"
            min={2005}
            max={2022}
            className="rounded-md border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black"
          />
        </label>
        <button
          type="submit"
          data-testid="profile-create"
          className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          {t("create")}
        </button>
      </form>
    </main>
  );
}
