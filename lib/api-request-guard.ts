import type { NextRequest } from "next/server";
import { isApiRequestOriginAllowed, shouldCheckApiRequestOrigin } from "./request-security";
import {
  isTrustedProxyRequest,
  isValidWebSession,
  isWebPasswordEnabled,
  webPasswordConfigurationProblem,
  OMP_WEB_SESSION_COOKIE,
  OMP_WEB_TRUSTED_HEADER,
} from "./web-auth";

// Also used by streaming uploads, which must not pass through Next's body-cloning proxy.
export function guardApiRequest(request: NextRequest): Response | null {
  if (shouldCheckApiRequestOrigin(request) && !isApiRequestOriginAllowed(request)) {
    return Response.json({ error: "Cross-origin API requests are not allowed" }, { status: 403 });
  }
  const passwordProblem = webPasswordConfigurationProblem();
  if (passwordProblem) {
    return new Response(`omp-web password configuration error\n\n${passwordProblem}\n`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (request.nextUrl.pathname !== "/api/web-auth/session" && isWebPasswordEnabled()
    && !isTrustedProxyRequest(request.headers.get(OMP_WEB_TRUSTED_HEADER))
    && !isValidWebSession(request.cookies.get(OMP_WEB_SESSION_COOKIE)?.value)) {
    return Response.json({ error: "Password required", code: "password_required" }, { status: 401 });
  }
  return null;
}
