export const MAX_MEMO_TITLE = 120;
export const MAX_MEMO_CONTENT = 20000;
export const MAX_MEMOS = 200;
export type MemoFields = { title: string; content: string; pinned: boolean };
export type Memo = MemoFields & { id: string; revision: number; createdAt: string; updatedAt: string };
export const validMemoId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id);
export function validMemoFields(value: unknown): value is MemoFields {
  if (!value || typeof value !== "object") return false;
  const v = value as MemoFields;
  return typeof v.title === "string" && v.title.length <= MAX_MEMO_TITLE && typeof v.content === "string" && v.content.length <= MAX_MEMO_CONTENT && typeof v.pinned === "boolean";
}
export function validMemo(value: unknown): value is Memo {
  const v = value as Memo;
  return validMemoFields(v) && validMemoId(v.id) && Number.isSafeInteger(v.revision) && v.revision > 0
    && typeof v.createdAt === "string" && Number.isFinite(Date.parse(v.createdAt)) && typeof v.updatedAt === "string" && Number.isFinite(Date.parse(v.updatedAt));
}
export const sameMemoFields = (a: MemoFields, b: MemoFields) => a.title === b.title && a.content === b.content && a.pinned === b.pinned;
export const sortMemos = (memos: Memo[]) => [...memos].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
export const MEMOS_OPEN_EVENT = "omp-web:open-memos";
export function openMemos() { window.dispatchEvent(new Event(MEMOS_OPEN_EVENT)); }
