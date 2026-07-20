import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminEmailsConfigured, isAdminEmail } from "@/lib/adminAuth";

/**
 * Supabase Auth gate for the admin tool and its API routes.
 *
 * When ADMIN_EMAILS is unset (local dev), admin stays open.
 * When set, /admin/* and /api/* require a Supabase session whose email is
 * on the allowlist. /admin/login and /auth/callback are always public.
 */

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  const isLogin = path === "/admin/login" || path.startsWith("/admin/login/");
  const isCallback = path === "/auth/callback" || path.startsWith("/auth/callback/");
  const isAdmin = path.startsWith("/admin");
  const isApi = path.startsWith("/api");

  // Public escape hatches — never gate these.
  if (isLogin || isCallback) {
    // Still refresh the session cookie if Supabase is configured.
    if (url && key) {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
            Object.entries(headers).forEach(([h, v]) => response.headers.set(h, v));
          },
        },
      });
      await supabase.auth.getUser();
    }
    return response;
  }

  if (!isAdmin && !isApi) return response;

  // No allowlist configured → leave admin open (local convenience).
  if (!adminEmailsConfigured()) return response;

  if (!url || !key) {
    return isApi ? unauthorized() : loginRedirect(request);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([h, v]) => response.headers.set(h, v));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    // Signed in but not allowlisted: sign out so they can try another account.
    if (user && !isAdminEmail(user.email)) {
      await supabase.auth.signOut();
    }
    return isApi ? unauthorized() : loginRedirect(request);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*", "/auth/callback"],
};
