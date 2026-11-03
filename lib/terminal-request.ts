/** Ask the shell to open the right panel's Terminal tab with a new shell in
 *  `cwd`. AppShell listens; any component (sidebar, explorer, context menus)
 *  can request it without threading callbacks through. */
export const OPEN_TERMINAL_EVENT = "omp:open-terminal";

export interface OpenTerminalDetail {
  cwd: string;
}

export function requestTerminalAt(cwd: string): void {
  window.dispatchEvent(new CustomEvent<OpenTerminalDetail>(OPEN_TERMINAL_EVENT, { detail: { cwd } }));
}
