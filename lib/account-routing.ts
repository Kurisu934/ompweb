import { createHash } from "crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { createInterface } from "readline";
import { parse, stringify } from "yaml";
import { getAgentDir, getSettingsPath } from "./omp/paths";
import { getProviderAccounts, type ProviderAccount, type ProviderAccountIdentity } from "./provider-usage";
import { PROVIDER_ACCOUNT_KEY_RE } from "./provider-usage-types";
import { isRecord } from "./type-guards";
import type { AccountPins } from "./account-choices";

/**
 * Which OAuth account omp uses, steered through omp's own
 * `auth.accountPolicies` (omp has no RPC to pick or disable an account).
 *
 * - A disabled account gets `reservePct: 100`: omp ranks it after every
 *   account that still has quota, so it only serves when the others are
 *   exhausted or blocked.
 * - A session pin gives the chosen account `priority: 100` and every other
 *   account of that provider `reservePct: 100`. Reserve status also breaks
 *   omp's per-session stickiness, so a pin moves a running conversation over.
 *
 * Policies are spawn-time config: they reach a session's omp child as a
 * `--config` overlay, and a changed signature restarts an idle child before
 * its next prompt (`AgentSessionWrapper.send`).
 */

interface AccountRoutingState {
  disabled: string[];
  sessions: Record<string, AccountPins>;
}

export interface AccountPolicy {
  provider: string;
  account: ProviderAccountIdentity;
  priority?: number;
  reservePct?: number;
}

const PROVIDER_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
const SESSION_KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PINNED_PRIORITY = 100;
const FULL_RESERVE_PCT = 100;

function statePath(): string {
  return path.join(getAgentDir(), "omp-web-account-routing.json");
}

declare global {
  // Shared across module instances (instrumentation and route bundles).
  var __ompWebAccountRouting: { path: string; state: AccountRoutingState } | undefined;
}

export function sanitizeAccountPins(raw: unknown): AccountPins {
  const pins: AccountPins = {};
  if (!isRecord(raw)) return pins;
  for (const [provider, key] of Object.entries(raw)) {
    if (PROVIDER_ID_RE.test(provider) && typeof key === "string" && PROVIDER_ACCOUNT_KEY_RE.test(key)) pins[provider] = key;
  }
  return pins;
}

export function isAccountRoutingSessionKey(value: unknown): value is string {
  return typeof value === "string" && SESSION_KEY_RE.test(value);
}

export function isProviderId(value: unknown): value is string {
  return typeof value === "string" && PROVIDER_ID_RE.test(value);
}

export function loadAccountRouting(): AccountRoutingState {
  const file = statePath();
  const cached = globalThis.__ompWebAccountRouting;
  if (cached?.path === file) return cached.state;
  const state: AccountRoutingState = { disabled: [], sessions: {} };
  try {
    if (existsSync(file)) {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (isRecord(raw)) {
        if (Array.isArray(raw.disabled)) {
          state.disabled = [...new Set(raw.disabled.filter((key): key is string => typeof key === "string" && PROVIDER_ACCOUNT_KEY_RE.test(key)))];
        }
        if (isRecord(raw.sessions)) {
          for (const [sessionId, pins] of Object.entries(raw.sessions)) {
            const clean = sanitizeAccountPins(pins);
            if (SESSION_KEY_RE.test(sessionId) && Object.keys(clean).length > 0) state.sessions[sessionId] = clean;
          }
        }
      }
    }
  } catch {
    // Unreadable state falls back to omp choosing every account.
  }
  globalThis.__ompWebAccountRouting = { path: file, state };
  return state;
}

function writeAtomic(file: string, content: string): void {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, content, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}

function saveAccountRouting(state: AccountRoutingState): AccountRoutingState {
  const file = statePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, `${JSON.stringify(state, null, 2)}\n`);
  globalThis.__ompWebAccountRouting = { path: file, state };
  return state;
}

export function setAccountDisabled(accountKey: string, disabled: boolean): AccountRoutingState {
  const current = loadAccountRouting();
  const rest = current.disabled.filter((key) => key !== accountKey);
  return saveAccountRouting({ ...current, disabled: disabled ? [...rest, accountKey] : rest });
}

/** Replace one provider's pin for a session; `null` returns it to omp's choice. */
export function setSessionAccountPin(sessionId: string, provider: string, accountKey: string | null): AccountPins {
  const current = loadAccountRouting();
  const pins = { ...current.sessions[sessionId] };
  if (accountKey) pins[provider] = accountKey;
  else delete pins[provider];
  return setSessionAccountPins(sessionId, pins, current);
}

export function setSessionAccountPins(sessionId: string, pins: AccountPins, current = loadAccountRouting()): AccountPins {
  const sessions = { ...current.sessions };
  if (Object.keys(pins).length > 0) sessions[sessionId] = pins;
  else delete sessions[sessionId];
  saveAccountRouting({ ...current, sessions });
  return pins;
}

export function forgetSessionAccountPins(sessionId: string): void {
  const current = loadAccountRouting();
  if (current.sessions[sessionId]) setSessionAccountPins(sessionId, {}, current);
}

/** Changes whenever the policies a session's child should run with change. */
export function accountRoutingSignature(sessionId: string, pinsOverride?: AccountPins): string {
  const state = loadAccountRouting();
  const pins = pinsOverride ?? state.sessions[sessionId] ?? {};
  return JSON.stringify([[...state.disabled].sort(), Object.entries(pins).sort(([a], [b]) => a.localeCompare(b))]);
}

const MATCH_FIELD_SETS: Array<Array<keyof ProviderAccountIdentity>> = [
  ["accountId"], ["email"], ["projectId"], ["accountId", "orgId"], ["email", "orgId"], ["projectId", "orgId"],
];

// omp rejects a policy that matches zero or several stored accounts, and that
// rejection fails every request for the provider. Match on the fewest fields
// that tell this provider's accounts apart.
function matchIdentity(account: ProviderAccount, siblings: ProviderAccount[]): ProviderAccountIdentity | undefined {
  for (const fields of MATCH_FIELD_SETS) {
    if (!fields.every((field) => account.identity[field])) continue;
    const same = (other: ProviderAccount) => fields.every((field) => other.identity[field] === account.identity[field]);
    if (siblings.filter(same).length !== 1) continue;
    return Object.fromEntries(fields.map((field) => [field, account.identity[field]]));
  }
  return undefined;
}

/** omp policies for the accounts omp-web steers; providers with one account are left alone. */
export function buildAccountPolicies(accounts: ProviderAccount[], disabled: ReadonlySet<string>, pins: AccountPins): AccountPolicy[] {
  const byProvider = new Map<string, ProviderAccount[]>();
  for (const account of accounts) byProvider.set(account.provider, [...(byProvider.get(account.provider) ?? []), account]);
  const policies: AccountPolicy[] = [];
  for (const [provider, siblings] of byProvider) {
    if (siblings.length < 2) continue;
    const matches = siblings.map((account) => ({ account, match: matchIdentity(account, siblings) }));
    if (matches.some(({ match }) => !match)) continue;
    const pinned = siblings.find((account) => account.accountKey === pins[provider]);
    for (const { account, match } of matches) {
      if (pinned) {
        policies.push(account === pinned
          ? { provider, account: match!, priority: PINNED_PRIORITY }
          : { provider, account: match!, reservePct: FULL_RESERVE_PCT });
      } else if (disabled.has(account.accountKey)) {
        policies.push({ provider, account: match!, reservePct: FULL_RESERVE_PCT });
      }
    }
  }
  return policies;
}

function configuredPolicies(file: string): unknown[] | undefined {
  try {
    if (!existsSync(file)) return undefined;
    const data: unknown = parse(readFileSync(file, "utf8"));
    const auth = isRecord(data) ? data.auth : undefined;
    return isRecord(auth) && Array.isArray(auth.accountPolicies) ? auth.accountPolicies : undefined;
  } catch {
    return undefined;
  }
}

/** The overlay replaces the user's own list, so carry over their entries for providers omp-web is not steering. */
export function withUserPolicies(policies: AccountPolicy[], userPolicies: unknown[]): unknown[] {
  const steered = new Set(policies.map((policy) => policy.provider));
  return [...userPolicies.filter((entry) => !(isRecord(entry) && typeof entry.provider === "string" && steered.has(entry.provider))), ...policies];
}

function writeOverlay(policies: unknown[]): string {
  const content = stringify({ auth: { accountPolicies: policies } });
  const dir = path.join(getAgentDir(), "omp-web-overlays");
  // Content-addressed and never rewritten: omp re-reads overlays while running.
  const file = path.join(dir, `account-policies-${createHash("sha256").update(content).digest("hex").slice(0, 16)}.yml`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeAtomic(file, content);
  }
  return file;
}

/** `--config <overlay>` steering this session's accounts, plus the signature it was built from. Never throws: on any failure omp chooses. */
export async function accountRoutingSpawnArgs(sessionId: string, cwd: string, pinsOverride?: AccountPins): Promise<{ args: string[]; signature: string }> {
  const signature = accountRoutingSignature(sessionId, pinsOverride);
  const state = loadAccountRouting();
  const pins = pinsOverride ?? state.sessions[sessionId] ?? {};
  if (state.disabled.length === 0 && Object.keys(pins).length === 0) return { args: [], signature };
  try {
    const policies = buildAccountPolicies(await getProviderAccounts(), new Set(state.disabled), pins);
    if (policies.length === 0) return { args: [], signature };
    const user = configuredPolicies(path.join(cwd, ".omp", "config.yml")) ?? configuredPolicies(getSettingsPath()) ?? [];
    return { args: ["--config", writeOverlay(withUserPolicies(policies, user))], signature };
  } catch {
    return { args: [], signature };
  }
}

/** omp's `credentialPinHash` (session/credential-pin.ts): the persisted id of the account that served a turn. */
export function credentialPinHash(provider: string, identity: ProviderAccountIdentity): string | undefined {
  if (!identity.accountId && !identity.email) return undefined;
  const key = [provider, identity.accountId ?? "", identity.email ?? "", identity.orgId ?? "", identity.projectId ?? ""].join("\0");
  return createHash("sha256").update(key).digest("hex");
}

/** Accounts that served this session most recently, per provider, from its `credential_pin` entries. */
export async function servingAccounts(sessionFile: string, accounts: ProviderAccount[]): Promise<AccountPins> {
  const latest = new Map<string, string>();
  const lines = createInterface({ input: createReadStream(sessionFile, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes("\"credential_pin\"")) continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (isRecord(entry) && entry.type === "credential_pin" && typeof entry.provider === "string" && typeof entry.hash === "string") {
        latest.set(entry.provider, entry.hash);
      }
    } catch {
      // Torn trailing line while omp is writing.
    }
  }
  const serving: AccountPins = {};
  for (const account of accounts) {
    if (latest.get(account.provider) === credentialPinHash(account.provider, account.identity)) serving[account.provider] = account.accountKey;
  }
  return serving;
}
