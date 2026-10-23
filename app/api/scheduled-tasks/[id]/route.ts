import { NextResponse } from "next/server";
import { parseJsonWithinLimit } from "@/lib/bounded-form-data";
import { allowFileRoot } from "@/lib/file-access";
import {
  deleteScheduledTask,
  regenerateScheduledTaskWebhook,
  runScheduledTaskNow,
  setScheduledTaskEnabled,
  updateScheduledTask,
  type ScheduledTaskInput,
} from "@/lib/scheduled-tasks";
import { MAX_TASK_REQUEST_BYTES, taskErrorResponse } from "@/lib/scheduled-task-responses";

export const dynamic = "force-dynamic";

const NOT_FOUND = { error: "Scheduled task not found", code: "scheduled_task_not_found" } as const;

// PATCH body: { action: "run" } runs once now; { action: "regenerate-webhook" }
// issues a new webhook URL; { enabled } pauses/resumes; otherwise the full
// task definition replaces the current one.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await parseJsonWithinLimit<(ScheduledTaskInput & { action?: unknown }) | null>(req, MAX_TASK_REQUEST_BYTES) ?? {};
    if (body.action === "run") {
      return runScheduledTaskNow(id)
        ? NextResponse.json({ accepted: true }, { status: 202 })
        : NextResponse.json(NOT_FOUND, { status: 404 });
    }
    if (body.action === "regenerate-webhook") {
      const task = regenerateScheduledTaskWebhook(id);
      return task ? NextResponse.json({ task }) : NextResponse.json(NOT_FOUND, { status: 404 });
    }
    if (Object.keys(body).length === 1 && typeof body.enabled === "boolean") {
      const task = setScheduledTaskEnabled(id, body.enabled);
      return task ? NextResponse.json({ task }) : NextResponse.json(NOT_FOUND, { status: 404 });
    }
    const task = await updateScheduledTask(id, body);
    if (!task) return NextResponse.json(NOT_FOUND, { status: 404 });
    if (!task.targetSessionId) allowFileRoot(task.cwd);
    return NextResponse.json({ task });
  } catch (error) {
    return taskErrorResponse(error);
  }
}

// DELETE — remove the task; its run sessions stay.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return deleteScheduledTask(id)
      ? NextResponse.json({ success: true })
      : NextResponse.json(NOT_FOUND, { status: 404 });
  } catch (error) {
    return taskErrorResponse(error);
  }
}
