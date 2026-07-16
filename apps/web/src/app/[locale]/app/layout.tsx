import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSessionOrRedirect, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import * as repo from "@/server/repo";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // getSessionOrRedirect already sends signed-out visitors back to the landing page — every page
  // under /app also redirects on its own, so this is belt-and-braces, but the layout is the one
  // place that holds for every current and future route in the segment.
  const session = await getSessionOrRedirect(locale);

  let activeProfileName: string | null = null;
  const profileId = (await cookies()).get("lyceora_profile")?.value;
  if (profileId) {
    try {
      activeProfileName = (await repo.getOwnedProfile(db, session.user.id, profileId)).displayName;
    } catch {
      // stale/foreign cookie: nav simply omits the chip; pages keep their own redirects
    }
  }

  async function logout() {
    "use server";
    await auth.api.signOut({ headers: await headers() });
    (await cookies()).delete("lyceora_profile");
    redirect(`/${locale}`);
  }

  return (
    <>
      <AppNav
        locale={locale}
        isAdminUser={isAdmin(session.user)}
        activeProfileName={activeProfileName}
        logoutAction={logout}
      />
      {children}
    </>
  );
}
