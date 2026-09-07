/**
 * sample-files/api-usage.ts
 * 
 * Demonstrates how to use the TaskFactory to create and manage tasks.
 * This file contains intentional bugs for the tour to practice fixing.
 */

import { TaskFactory } from "./factory";
import type { Task } from "./data-structure";

// Create a factory instance
const factory = new TaskFactory();

// Create some sample tasks
const task1 = factory.createTask("Implement login");
const task2 = factory.createTask("Add password validation");
const task3 = factory.createTask("Write tests");

console.log("Created tasks:");
console.log(task1);
console.log(task2);
console.log(task3);

// BUG: updateTaskStatus requires two arguments (id and status),
// but this call only provides one. The status argument is missing.
const updatedTask = factory.updateTaskStatus("task-001");

if (updatedTask) {
  console.log("Updated task status:");
  console.log(updatedTask);
} else {
  console.log("Task not found or update failed");
}

// List all tasks
const allTasks: Task[] = factory.getAllTasks();
console.log(`Total tasks: ${allTasks.length}`);
