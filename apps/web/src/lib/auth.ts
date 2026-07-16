import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as authSchema from "@lyceora/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // admin must come before nextCookies — nextCookies must be last (see better-auth's own
  // warnIfCookiePluginNotLast guard). It bridges any Set-Cookie header from a direct
  // `auth.api.xxx({ headers })` server-side call (not routed through the [...all] catch-all
  // handler's real HTTP response) into next/headers' cookies() store — e.g. the admin
  // plugin's stopImpersonating endpoint restores the ADMIN session cookie server-side (Task 6's
  // /api/admin/stop-impersonating route handler), which never reaches the browser without this.
  plugins: [admin({ defaultRole: "parent" }), nextCookies()]
});
