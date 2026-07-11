import { auth } from "@/lib/auth";
import { ForbiddenError, ConflictError } from "./repo";

/** Resolves the authenticated user id from a Route Handler's Request, or a ready-to-return 401. */
export async function requireUserId(req: Request): Promise<string | Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });
  return session.user.id;
}

/**
 * Runs a route handler body, mapping ForbiddenError -> 403, ConflictError -> 409, and any other
 * error -> 500 (logged server-side).
 */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response(null, { status: 403 });
    if (err instanceof ConflictError) return Response.json({ error: err.message }, { status: 409 });
    console.error(err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
