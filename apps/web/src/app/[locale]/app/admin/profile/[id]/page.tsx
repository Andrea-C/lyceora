import { notFound } from "next/navigation";
import { requireAdminOrNotFound } from "@/lib/session";
import { db } from "@/lib/db";
import { getGraph } from "@/server/content";
import { getProfileReport } from "@/server/services/profile-report";
import { ProfileReport } from "@/components/ProfileReport";

export default async function AdminProfilePage({
  params
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAdminOrNotFound(locale);
  const resolvedLocale = locale === "en" ? "en" : "it";

  let data;
  try {
    data = await getProfileReport(db, getGraph(), id, resolvedLocale);
  } catch {
    // Unknown profile id — 404 rather than leaking whether the id exists (same posture as
    // requireAdminOrNotFound: admin routes never advertise what they can't show).
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{data.displayName}</h1>
      <ProfileReport data={data} locale={resolvedLocale} />
    </main>
  );
}
