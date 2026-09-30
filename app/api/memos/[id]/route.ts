import { deleteMemo, updateMemo, memoErrorResponse, memoRequestBody } from "@/lib/memo-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try { return Response.json({ memo: await updateMemo((await context.params).id, await memoRequestBody(request)) }); }
  catch (error) { return memoErrorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const body = await memoRequestBody(request) as { revision?: unknown } | null;
    await deleteMemo((await context.params).id, body?.revision); return Response.json({ ok: true });
  } catch (error) { return memoErrorResponse(error); }
}
