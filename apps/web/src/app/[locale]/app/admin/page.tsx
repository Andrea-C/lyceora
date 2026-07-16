import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireAdminOrNotFound } from "@/lib/session";
import { getAdminDashboard } from "@/server/services/admin";

export default async function AdminPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdminOrNotFound(locale);
  const t = await getTranslations("admin");

  const { counters, users } = await getAdminDashboard(db);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-zinc-600 dark:text-zinc-400">{t("countUsers")}</dt>
          <dd className="text-lg font-semibold">{counters.users}</dd>
        </div>
        <div>
          <dt className="text-zinc-600 dark:text-zinc-400">{t("countProfiles")}</dt>
          <dd className="text-lg font-semibold">{counters.profiles}</dd>
        </div>
        <div>
          <dt className="text-zinc-600 dark:text-zinc-400">{t("countSessions7d")}</dt>
          <dd className="text-lg font-semibold">{counters.sessions7d}</dd>
        </div>
        <div>
          <dt className="text-zinc-600 dark:text-zinc-400">{t("countActive7d")}</dt>
          <dd className="text-lg font-semibold">{counters.activeProfiles7d}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg text-zinc-600 dark:text-zinc-400">{t("users")}</h2>
        <ul className="flex flex-col gap-4">
          {users.map((u) => (
            <li key={u.id} className="rounded-2xl border border-black/[.08] p-5 dark:border-white/[.15]">
              <h3 className="text-xl font-semibold">{u.email}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {u.profiles.map((p) => (
                  <li key={p.id}>
                    {/* Drill-in page lands in Task 6 — dead link until then. */}
                    <Link
                      href={`/${locale}/app/admin/profile/${p.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/[.08] p-3 text-sm transition-colors hover:bg-black/[.02] dark:border-white/[.15] dark:hover:bg-white/[.04]"
                    >
                      <span className="font-medium">{p.displayName}</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {p.diagnosticDone ? t("stageActive") : t("stagePending")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
