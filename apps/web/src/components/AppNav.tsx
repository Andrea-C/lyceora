import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleSwitch } from "./LocaleSwitch";

/** Presentational, server-safe (no "use client" — useTranslations works fine in RSC, same as
 * XpBar/PathProgress). The app-segment layout (`app/[locale]/app/layout.tsx`) does the data
 * fetching (session, active-profile cookie lookup) and hosts the logout server action. */
export function AppNav({
  locale,
  isAdminUser,
  activeProfileName,
  logoutAction
}: {
  locale: string;
  isAdminUser: boolean;
  activeProfileName: string | null;
  logoutAction: () => Promise<void>;
}) {
  const t = useTranslations("nav");
  const base = `/${locale}/app`;

  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-black/[.08] px-6 py-3 text-sm dark:border-white/[.15]">
      <Link href={base} className="font-semibold tracking-tight">Lyceora</Link>
      {activeProfileName && (
        <>
          <Link href={base}>{t("home")}</Link>
          <Link href={`${base}/session`}>{t("session")}</Link>
        </>
      )}
      <Link href={`${base}/parent`}>{t("parent")}</Link>
      {isAdminUser && <Link href={`${base}/admin`}>{t("dashboard")}</Link>}
      <span className="flex-1" />
      {activeProfileName && (
        <Link
          href={`${base}/profiles`}
          title={t("switchProfile")}
          className="rounded-full border border-black/[.1] px-3 py-1 dark:border-white/[.15]"
        >
          {activeProfileName}
        </Link>
      )}
      <form action={logoutAction}>
        <button type="submit">{t("logout")}</button>
      </form>
      <LocaleSwitch />
    </nav>
  );
}
