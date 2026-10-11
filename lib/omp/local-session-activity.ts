import { LocalBridgeClient, listLiveSessionMetadata, type LocalSessionMetadata } from "./local-bridge";
import { readSessionHeaderSync } from "./session-files";
import type { RpcSessionState } from "../pi-types";

interface ObservedSession {
  metadata: LocalSessionMetadata;
  cwd: string;
  client?: LocalBridgeClient;
  streaming: boolean;
  compacting: boolean;
  revision: number;
}

/** Read-only connections, independent of the registry that owns interactive RPCs. */
class LocalSessionActivity {
  private readonly entries = new Map<string, ObservedSession>();
  private readonly listeners = new Set<() => void>();
  private users = 0;
  private generation = 0;
  private timer: NodeJS.Timeout | undefined;
  private refreshing: Promise<void> | undefined;

  retain(listener?: () => void): () => void {
    if (listener) this.listeners.add(listener);
    if (this.users++ === 0) {
      // Discovery also reconciles compaction, which older bridges do not broadcast.
      this.timer = setInterval(() => { void this.refresh().catch(() => {}); }, 5_000);
      this.timer.unref();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (listener) this.listeners.delete(listener);
      if (--this.users > 0) return;
      clearInterval(this.timer);
      this.timer = undefined;
      this.generation++;
      this.refreshing = undefined;
      for (const entry of this.entries.values()) void entry.client?.dispose();
      this.entries.clear();
    };
  }

  running(): { id: string; cwd: string }[] {
    const sessions: { id: string; cwd: string }[] = [];
    for (const entry of this.entries.values()) {
      if (entry.client?.isAlive && (entry.streaming || entry.compacting)) {
        sessions.push({ id: entry.metadata.sessionId, cwd: entry.cwd });
      }
    }
    return sessions;
  }

  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const refresh = this.scan(this.generation).finally(() => {
      if (this.refreshing === refresh) this.refreshing = undefined;
    });
    this.refreshing = refresh;
    return refresh;
  }

  private changed(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* isolate disconnected subscribers */ }
    }
  }

  private remove(entry: ObservedSession): void {
    if (this.entries.get(entry.metadata.sessionFile) !== entry) return;
    this.entries.delete(entry.metadata.sessionFile);
    void entry.client?.dispose();
    if (entry.streaming || entry.compacting) this.changed();
  }

  private update(entry: ObservedSession, streaming: boolean, compacting: boolean): void {
    const wasRunning = entry.streaming || entry.compacting;
    entry.streaming = streaming;
    entry.compacting = compacting;
    if (wasRunning !== (streaming || compacting)) this.changed();
  }

  private async scan(generation: number): Promise<void> {
    const owners = listLiveSessionMetadata();
    const files = new Set(owners.map((owner) => owner.sessionFile));
    for (const entry of this.entries.values()) {
      if (!files.has(entry.metadata.sessionFile)) this.remove(entry);
    }
    let next = 0;
    const inspect = async () => {
      while (next < owners.length && generation === this.generation) {
        const metadata = owners[next++];
        let entry = this.entries.get(metadata.sessionFile);
        if (entry && (entry.metadata.pid !== metadata.pid
          || entry.metadata.token !== metadata.token
          || entry.metadata.socketPath !== metadata.socketPath
          || entry.metadata.sessionId !== metadata.sessionId)) {
          this.remove(entry);
          entry = undefined;
        }
        try {
          if (!entry) {
            const header = readSessionHeaderSync(metadata.sessionFile);
            if (!header || header.id !== metadata.sessionId || typeof header.cwd !== "string") continue;
            entry = { metadata, cwd: header.cwd, streaming: false, compacting: false, revision: 0 };
            this.entries.set(metadata.sessionFile, entry);
          }
          const observed = entry;
          if (!observed.client) {
            const client = await LocalBridgeClient.connect(metadata, 3_000, {
              onExit: () => this.remove(observed),
            });
            if (this.entries.get(metadata.sessionFile) !== observed) {
              await client.dispose();
              continue;
            }
            observed.client = client;
            client.onFrame((frame) => {
              if (this.entries.get(metadata.sessionFile) !== observed) return;
              switch (frame.type) {
                case "agent_start":
                case "agent_end":
                  observed.revision++;
                  this.update(observed, frame.type === "agent_start", observed.compacting);
                  break;
                case "auto_compaction_start":
                case "auto_compaction_end":
                  observed.revision++;
                  this.update(observed, observed.streaming, frame.type === "auto_compaction_start");
                  break;
              }
            });
          }
          const revision = observed.revision;
          const state = await observed.client.sendCommand<RpcSessionState>({ type: "get_state" }, 3_000);
          if (this.entries.get(metadata.sessionFile) !== observed) continue;
          if (state.sessionId !== metadata.sessionId) {
            this.remove(observed);
            continue;
          }
          // An event received during get_state wins over the older snapshot.
          if (observed.revision === revision) {
            this.update(observed, state.isStreaming === true, state.isCompacting === true);
          }
        } catch {
          // An unreachable owner is not running evidence; discovery retries later.
          if (entry) this.remove(entry);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, owners.length) }, () => inspect()));
  }
}

declare global {
  var __ompLocalSessionActivity: LocalSessionActivity | undefined;
}

/** Current live snapshot for synchronous running-status broadcasts. */
export function getLocalRunningSessions(): { id: string; cwd: string }[] {
  return globalThis.__ompLocalSessionActivity?.running() ?? [];
}

/** A fresh snapshot, including when no browser has opened the running SSE yet. */
export async function readLocalRunningSessions(): Promise<{ id: string; cwd: string }[]> {
  const activity = globalThis.__ompLocalSessionActivity ??= new LocalSessionActivity();
  const release = activity.retain();
  try {
    await activity.refresh();
    return activity.running();
  } finally {
    release();
  }
}

/** Observe without host tools, prompt commands, or ownership of the source process. */
export function subscribeLocalSessionActivity(listener: () => void): () => void {
  const activity = globalThis.__ompLocalSessionActivity ??= new LocalSessionActivity();
  // Give each subscription its own identity, even if callers share a callback.
  const release = activity.retain(() => listener());
  void activity.refresh().catch(() => {});
  return release;
}
