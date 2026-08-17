import { getTranslations } from "next-intl/server";

export default async function PathLoading() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16">
      <p className="text-lg text-zinc-600 dark:text-zinc-400">{t("loading")}</p>
    </main>
  );
}
