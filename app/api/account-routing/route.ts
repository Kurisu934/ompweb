import { NextResponse } from "next/server";
import {
  isProviderId,
  loadAccountRouting,
  servingAccounts,
  setAccountDisabled,
  setSessionAccountPin,
} from "@/lib/account-routing";
import type { AccountPins, AccountRoutingView } from "@/lib/account-choices";
import { getProviderAccounts } from "@/lib/provider-usage";
import { PROVIDER_ACCOUNT_KEY_RE } from "@/lib/provider-usage-types";
import { isValidSessionId } from "@/lib/session-file-references-core";
import { resolveSessionPath } from "@/lib/session-reader";
import { isRecord } from "@/lib/type-guards";

export const dynamic = "force-dynamic";

function invalid(error: string, code: string) {
  return NextResponse.json({ error, code }, { status: 400 });
}

async function serving(sessionId: string): Promise<AccountPins> {
  try {
    const file = await resolveSessionPath(sessionId);
    return file ? await servingAccounts(file, await getProviderAccounts()) : {};
  } catch {
    return {};
  }
}

// GET /api/account-routing?sessionId= → { disabled, pins, serving }
// pins: this session's chosen account per provider; serving: the account omp
// last used per provider (from the session's credential_pin entries).
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (sessionId !== null && !isValidSessionId(sessionId)) return invalid("Invalid session id", "invalid_session_id");
  const state = loadAccountRouting();
  const view: AccountRoutingView = {
    disabled: state.disabled,
    pins: sessionId ? state.sessions[sessionId] ?? {} : {},
    serving: sessionId ? await serving(sessionId) : {},
  };
  return NextResponse.json(view);
}

// PUT /api/account-routing
//   { accountKey, disabled: boolean }                    temporarily disable an account
//   { sessionId, provider, accountKey: string | null }   pin a session's account (null = omp decides)
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalid("Invalid JSON request body", "invalid_json");
  }
  if (!isRecord(body)) return invalid("Invalid request body", "invalid_body");
  const { accountKey } = body;
  if (accountKey !== null && (typeof accountKey !== "string" || !PROVIDER_ACCOUNT_KEY_RE.test(accountKey))) {
    return invalid("accountKey must be a provider account key", "invalid_account_key");
  }
  if (typeof body.disabled === "boolean") {
    if (accountKey === null) return invalid("accountKey is required", "invalid_account_key");
    return NextResponse.json({ disabled: setAccountDisabled(accountKey, body.disabled).disabled });
  }
  if (typeof body.sessionId !== "string" || !isValidSessionId(body.sessionId)) return invalid("Invalid session id", "invalid_session_id");
  if (!isProviderId(body.provider)) return invalid("Invalid provider id", "invalid_provider");
  return NextResponse.json({ pins: setSessionAccountPin(body.sessionId, body.provider, accountKey) });
}
