import { createMemo, listMemos, memoErrorResponse, memoRequestBody } from "@/lib/memo-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ memos: await listMemos() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return memoErrorResponse(error); }
}
export async function POST(request: Request) {
  try { return Response.json({ memo: await createMemo(await memoRequestBody(request)) }, { status: 201 }); }
  catch (error) { return memoErrorResponse(error); }
}
