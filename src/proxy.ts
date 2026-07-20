import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTTP Basic Auth gate for the admin tool and its API routes.
 *
 * The public site (/, /list, /3d, /card/*, /print/*) reads from Supabase and
 * needs no protection. The admin workflow, however, is no-auth by design and
 * only fully functions locally (it uses SQLite + local files). On a hosted
 * deployment we still want the admin UI/API reachable but private.
 *
 * Enforcement is opt-in: auth is only required when ADMIN_PASSWORD is set.
 * That keeps local `next dev` password-free while protecting production, where
 * ADMIN_USER (default "admin") and ADMIN_PASSWORD are configured as env vars.
 */

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Recipe Cards Admin", charset="UTF-8"' },
  });
}

/** Constant-time string comparison to avoid credential timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.ADMIN_PASSWORD;
  // No password configured (e.g. local dev): leave the admin open.
  if (!password) return NextResponse.next();

  const expectedUser = process.env.ADMIN_USER || "admin";

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(":");
  const user = sep === -1 ? decoded : decoded.slice(0, sep);
  const pass = sep === -1 ? "" : decoded.slice(sep + 1);

  // Evaluate both comparisons so a wrong username can't short-circuit early.
  const ok = safeEqual(user, expectedUser) && safeEqual(pass, password);
  return ok ? NextResponse.next() : unauthorized();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
