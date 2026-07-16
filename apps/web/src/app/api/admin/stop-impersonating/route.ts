import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Ends an active impersonation session and hands the admin back their own session — the target
 * of the banner's plain form POST (ImpersonationBanner), not a client-JS call: the
 * `lyceora_profile` cookie is httpOnly, so only a server-side handler can clear it, and
 * `auth.api.stopImpersonating` itself needs to run server-side to swap the session cookie back
 * to the admin's (see `nextCookies()` in `@/lib/auth`, which bridges that Set-Cookie here).
 */
export async function POST(req: Request) {
  await auth.api.stopImpersonating({ headers: await headers() });
  (await cookies()).delete("lyceora_profile");
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "it";
  return Response.redirect(new URL(`/${locale}/app/admin`, req.url), 303);
}
