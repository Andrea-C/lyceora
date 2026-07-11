"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

/** Maps a better-auth failure `code` (e.g. "INVALID_EMAIL_OR_PASSWORD",
 * "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") to one of our own bilingual message keys — the raw
 * `authError.message` is always English and never shown to the user. Unrecognized/missing codes
 * fall back to a generic message rather than leaking provider text. */
function authErrorKey(code: string | undefined): "invalidCredentials" | "emailInUse" | "genericError" {
  if (code === "INVALID_EMAIL_OR_PASSWORD") return "invalidCredentials";
  if (code?.startsWith("USER_ALREADY_EXISTS")) return "emailInUse";
  return "genericError";
}

export default function LandingPage() {
  const t = useTranslations("landing");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: authError } =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

    setPending(false);

    if (authError) {
      setError(tAuth(authErrorKey(authError.code)));
      return;
    }

    router.push(`/${locale}/app/profiles`);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">{t("tagline")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        {mode === "signup" && (
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input
              className="rounded-md border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          {t("email")}
          <input
            type="email"
            className="rounded-md border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("password")}
          <input
            type="password"
            className="rounded-md border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {mode === "signup" ? t("signup") : t("login")}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          {mode === "signup" ? t("login") : t("signup")}
        </button>
      </form>
    </main>
  );
}
