import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, isDemoPersona } from "@/lib/auth/config";

/**
 * Optimistic route gate for /dashboard and /onboarding.
 * - When Clerk is configured, clerkMiddleware runs and signed-in users pass through.
 * - Without a Clerk session, a valid demo-persona cookie grants access to the demo dashboards only.
 * - Otherwise the visitor is sent to /demo, which explains both options.
 *
 * Real authorization happens close to the data (server actions and route handlers), not here.
 */
const PROTECTED = /^\/(dashboard|onboarding)(\/|$)/;

function hasDemoPersona(req: NextRequest) {
  return isDemoPersona(req.cookies.get(DEMO_COOKIE)?.value);
}

function gate(req: NextRequest, signedIn: boolean) {
  if (!PROTECTED.test(req.nextUrl.pathname)) return NextResponse.next();
  if (signedIn || hasDemoPersona(req)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/demo";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

let clerkHandler: ((req: NextRequest, evt: unknown) => Promise<Response> | Response) | null = null;

export default async function proxy(req: NextRequest, evt: unknown) {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) {
    if (!clerkHandler) {
      const { clerkMiddleware } = await import("@clerk/nextjs/server");
      clerkHandler = clerkMiddleware(async (auth, request) => {
        const { userId } = await auth();
        return gate(request as NextRequest, Boolean(userId));
      }) as unknown as typeof clerkHandler;
    }
    return clerkHandler!(req, evt);
  }
  return gate(req, false);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|glb|gltf)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
