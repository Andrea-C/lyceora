"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";

/** Toggles between the two supported locales, preserving the current path. */
export function LocaleSwitch() {
  const pathname = usePathname(); // includes the current locale prefix, e.g. "/it/app"
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("common");
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  function switchLocale() {
    const segments = pathname.split("/");
    segments[1] = other;
    router.push(segments.join("/") || "/");
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      data-testid="locale-switch"
      aria-label={t("switchLanguage")}
      className="rounded-full border border-black/[.1] px-3 py-1 text-sm font-medium uppercase dark:border-white/[.15]"
    >
      {other}
    </button>
  );
}
