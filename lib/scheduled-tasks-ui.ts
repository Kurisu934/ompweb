/** Client-safe: open the scheduled tasks window (components/ScheduledTasksPanel). */
export const SCHEDULED_TASKS_OPEN_EVENT = "omp-web:open-scheduled-tasks";

export function openScheduledTasks(): void {
  window.dispatchEvent(new Event(SCHEDULED_TASKS_OPEN_EVENT));
}
