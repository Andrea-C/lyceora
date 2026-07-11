import { getActiveProfileOrRedirect } from "@/lib/session";
import { DiagnosticClient } from "./diagnostic-client";

export default async function DiagnosticPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { profile } = await getActiveProfileOrRedirect(locale);

  return <DiagnosticClient profileId={profile.id} locale={locale} />;
}
