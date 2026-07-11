import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: t("title"), description: t("tagline") };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "it" | "en")) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations("footer");

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <header className="flex justify-end px-6 py-4">
            <LocaleSwitch />
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
          <footer className="border-t border-black/[.08] py-4 text-center text-xs text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            {t("attribution")}
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
