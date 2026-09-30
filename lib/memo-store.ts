import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir } from "./omp/paths";
import { MAX_MEMOS, sortMemos, validMemo, validMemoFields, validMemoId, type Memo } from "./memos";

export class MemoError extends Error {
  constructor(public code: string, public status = 400, public current?: Memo) { super(code); }
}
const filename = () => path.join(getAgentDir(), "web-memos.json");
const lockKey = Symbol.for("ompweb.memo-writes");
const registry = globalThis as typeof globalThis & { [lockKey]?: Map<string, Promise<unknown>> };
const locks = registry[lockKey] ??= new Map<string, Promise<unknown>>();

export async function listMemos(): Promise<Memo[]> {
  try {
    const file = filename();
    if ((await fs.stat(file)).size > 32 * 1024 * 1024) throw new MemoError("storage_invalid", 500);
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    if (data.version !== 1 || !Array.isArray(data.memos) || data.memos.length > MAX_MEMOS || !data.memos.every(validMemo)
      || new Set(data.memos.map((m: Memo) => m.id)).size !== data.memos.length) throw new MemoError("storage_invalid", 500);
    return sortMemos(data.memos);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error instanceof MemoError ? error : new MemoError("storage_invalid", 500);
  }
}
async function mutate<T>(fn: (memos: Memo[]) => T): Promise<T> {
  const file = filename(), previous = locks.get(file) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const memos = await listMemos(), result = fn(memos);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify({ version: 1, memos }), { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, file);
    } finally { await fs.unlink(temporary).catch(() => {}); }
    return result;
  });
  locks.set(file, task);
  try { return await task; } finally { if (locks.get(file) === task) locks.delete(file); }
}
export function createMemo(value: unknown) {
  if (!validMemoFields(value)) throw new MemoError("invalid");
  return mutate(memos => {
    if (memos.length >= MAX_MEMOS) throw new MemoError("limit", 409);
    const now = new Date().toISOString();
    const memo: Memo = { id: randomUUID(), title: value.title, content: value.content, pinned: value.pinned, revision: 1, createdAt: now, updatedAt: now };
    memos.push(memo); return memo;
  });
}
function findCurrent(memos: Memo[], id: string, revision: unknown) {
  if (!validMemoId(id) || !Number.isSafeInteger(revision) || (revision as number) < 1) throw new MemoError("invalid");
  const memo = memos.find(m => m.id === id);
  if (!memo) throw new MemoError("missing", 404);
  if (memo.revision !== revision) throw new MemoError("conflict", 409, memo);
  return memo;
}
export function updateMemo(id: string, value: unknown) {
  if (!validMemoFields(value)) throw new MemoError("invalid");
  return mutate(memos => {
    const memo = findCurrent(memos, id, (value as Memo).revision);
    Object.assign(memo, { title: value.title, content: value.content, pinned: value.pinned, revision: memo.revision + 1, updatedAt: new Date().toISOString() });
    return memo;
  });
}
export function deleteMemo(id: string, revision: unknown) {
  return mutate(memos => { const memo = findCurrent(memos, id, revision); memos.splice(memos.indexOf(memo), 1); });
}

export async function memoRequestBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new MemoError("invalid");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) throw new MemoError("invalid", 413);
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new MemoError("invalid"); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function memoErrorResponse(error: unknown) {
  return Response.json({ code: error instanceof MemoError ? error.code : "save_failed", ...(error instanceof MemoError && error.current ? { current: error.current } : {}) },
    { status: error instanceof MemoError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
