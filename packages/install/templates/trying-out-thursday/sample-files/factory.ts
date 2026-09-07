/**
 * sample-files/factory.ts
 * 
 * Provides a TaskFactory for creating and managing tasks with validation
 * and consistent default behavior.
 */

import type { Task } from "./data-structure";
import { createTask as baseCreateTask } from "./data-structure";

export class TaskFactory {
  private taskMap: Map<string, Task> = new Map();
  private idCounter = 0;

  /**
   * Generate a unique task ID.
   * @returns An ID in the format "task-NNN"
   */
  private generateId(): string {
    return `task-${String(++this.idCounter).padStart(3, "0")}`;
  }

  /**
   * Create a task with automatic ID generation.
   * 
   * @param title - Human-readable title
   * @param description - Task description
   * @param priority - Optional priority (1-5, default 3)
   * @returns The created task
   */
  createTask(title: string, description: string, priority?: number): Task {
    const id = this.generateId();
    const task = baseCreateTask(id, title, description);
    
    if (priority !== undefined && priority >= 1 && priority <= 5) {
      task.priority = priority;
    }

    this.taskMap.set(id, task);
    return task;
  }

  /**
   * Retrieve a task by ID.
   * @param id - The task ID
   * @returns The task, or undefined if not found
   */
  getTask(id: string): Task | undefined {
    return this.taskMap.get(id);
  }

  /**
   * Get all tasks currently managed by this factory.
   * @returns Array of all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.taskMap.values());
  }

  /**
   * Update a task's status.
   * 
   * @param id - The task ID
   * @param status - New status
   * @returns The updated task, or undefined if not found
   */
  updateTaskStatus(id: string, status: "open" | "in_progress" | "blocked" | "done"): Task | undefined {
    const task = this.taskMap.get(id);
    if (task) {
      task.status = status;
      task.modifiedAt = Date.now();
    }
    return task;
  }
}
