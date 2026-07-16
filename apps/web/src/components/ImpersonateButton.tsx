"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Admin dashboard's per-user "impersonate" action (Task 6). A real client component (unlike the
 * banner's stop side): `authClient.admin.impersonateUser` is a genuine fetch through the
 * `/api/auth/[...all]` catch-all, so its Set-Cookie response is applied by the browser directly —
 * no server-side cookie bridging needed here, unlike stopImpersonating.
 */
export function ImpersonateButton({
  userId,
  locale,
  label
}: {
  userId: string;
  locale: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-full border border-black/[.1] px-3 py-1 text-sm dark:border-white/[.15]"
      onClick={async () => {
        await authClient.admin.impersonateUser({ userId });
        router.push(`/${locale}/app/profiles`);
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
