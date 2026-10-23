import { NextResponse } from "next/server";
import { parseJsonWithinLimit } from "@/lib/bounded-form-data";
import { terminalErrorResponse } from "@/lib/terminal-api";
import { createTerminal, listTerminals, terminalsAvailable } from "@/lib/terminal-manager";
import { isRecord } from "@/lib/type-guards";

export const dynamic = "force-dynamic";

// GET /api/terminals → { available, terminals }
export async function GET() {
  return NextResponse.json({ available: await terminalsAvailable(), terminals: listTerminals() });
}

// POST /api/terminals { cwd?, cols?, rows? } → the new terminal (a shell in cwd, else home)
export async function POST(req: Request) {
  try {
    const body = await parseJsonWithinLimit<unknown>(req, 8 * 1024);
    const options = isRecord(body) ? body : {};
    const terminal = await createTerminal({
      cwd: typeof options.cwd === "string" ? options.cwd : undefined,
      cols: options.cols,
      rows: options.rows,
    });
    return NextResponse.json(terminal, { status: 201 });
  } catch (error) {
    return terminalErrorResponse(error);
  }
}
