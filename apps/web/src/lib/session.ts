import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function getSessionOrRedirect(locale: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}`);
  return session;
}
