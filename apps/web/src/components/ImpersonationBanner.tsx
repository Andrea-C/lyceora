/**
 * Server-safe (no "use client") — the "stop impersonating" action is a plain form POST to
 * /api/admin/stop-impersonating, not a client-JS call: the `lyceora_profile` cookie is httpOnly,
 * so client JS can't clear it, and the route handler needs to run server-side anyway to call
 * `auth.api.stopImpersonating`. See the app layout for where this renders (above AppNav, only
 * when `session.session.impersonatedBy` is set).
 */
export function ImpersonationBanner({
  label,
  stopLabel,
  locale
}: {
  label: string;
  stopLabel: string;
  locale: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-100 px-6 py-2 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100">
      <span>{label}</span>
      <form method="post" action={`/api/admin/stop-impersonating?locale=${locale}`}>
        <button type="submit" className="underline">
          {stopLabel}
        </button>
      </form>
    </div>
  );
}
