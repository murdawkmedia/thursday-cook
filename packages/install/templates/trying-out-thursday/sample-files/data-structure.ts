/**
 * sample-files/data-structure.ts
 * 
 * Defines the core data structure for the sample application:
 * a Task representing a unit of work in a project.
 */

export interface Task {
  /** Unique identifier for the task */
  id: string;

  /** Human-readable title */
  title: string;

  /** Detailed description of the task */
  description: string;

  /** Current status: open, in_progress, blocked, or done */
  status: "open" | "in_progress" | "blocked" | "done";

  /** Priority level from 1 (low) to 5 (critical) */
  priority: number;

  /** Unix timestamp when the task was created */
  createdAt: number;

  /** Unix timestamp when the task was last modified, or null if never modified */
  modifiedAt: number | null;

  /** ID of the person assigned to this task, or null if unassigned */
  assignedTo: string | null;

  /** List of dependencies: IDs of tasks that must be done first */
  dependencies: string[];

  /** List of tags for categorization and filtering */
  tags: string[];
}

/**
 * Create a new task with default values.
 * 
 * @param id - Unique identifier
 * @param title - Human-readable title
 * @param description - Detailed description
 * @returns A new Task with status 'open' and current timestamp
 */
export function createTask(id: string, title: string, description: string): Task {
  return {
    id,
    title,
    description,
    status: "open",
    priority: 3,
    createdAt: Date.now(),
    modifiedAt: null,
    assignedTo: null,
    dependencies: [],
    tags: [],
  };
}
