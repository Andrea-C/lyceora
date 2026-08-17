import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getActiveProfileOrRedirect } from "@/lib/session";
import { getPath } from "@/server/content";
import { SUBJECTS } from "@/server/subjects";
import * as repo from "@/server/repo";

/** Phase 1 of the journey: subject selection. One real subject today (Math → the recovery path);
 * a generic coming-soon row promises more without inventing fake subjects to disappoint.
 * Choosing goes straight into the diagnostic (fewest clicks for a 13-year-old); the journey
 * page reflects the new phase on the way back regardless. */
export default async function SubjectsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { profile } = await getActiveProfileOrRedirect(locale);
  const loc = locale === "en" ? "en" : "it";
  const t = await getTranslations("journey");

  const enrollment = await repo.getActiveEnrollment(db, profile.id);
  const math = SUBJECTS[0];
  const pathName = getPath(math.pathId).name[loc];

  async function chooseSubjectAction() {
    "use server";
    await repo.createEnrollment(db, profile.id, math.pathId);
    redirect(`/${locale}/app/diagnostic`);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("subjectsTitle")}</h1>
      <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-6 dark:border-white/[.15]">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-xl font-semibold">{t("subjectMath")}</h2>
          {enrollment && (
            <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">{t("yourSubject")}</span>
          )}
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">{pathName}</p>
        {!enrollment && (
          <form action={chooseSubjectAction}>
            <button
              type="submit"
              data-testid="start-diagnostic"
              className="rounded-full bg-foreground px-8 py-3 text-lg text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              {t("chooseSubject")}
            </button>
          </form>
        )}
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-black/[.12] p-6 text-zinc-500 dark:border-white/[.2] dark:text-zinc-400">
        <span className="flex-1">{t("moreSubjects")}</span>
        <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">{t("comingSoon")}</span>
      </div>
    </main>
  );
}
