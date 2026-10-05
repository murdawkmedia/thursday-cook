// Durable todos projection.
// Keeps the todo list across turns. Marks a list that outlived the turn
// that wrote it.
//
// Ported to dsh 0.1.5-rc.3: `TodoItem` and the `todo/write` event moved out
// of `@deepseek-ai/dsh-session` into `@deepseek-ai/dsh-tool-todo/types`
// (which declaration-merges both the event and the projection tables), and
// `ProjectionDefinition` split its old `schema`/`view` pair into a
// `stateSchema` plus an optional `wire: { viewSchema, view }` block.
import type {} from "@deepseek-ai/dsh-session-projection/types";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { TodoItem } from "@deepseek-ai/dsh-tool-todo";
import { z } from "zod";

export const DURABLE_TODOS_KEY = "durable-todos/todos";
export type { TodoItem };
export interface DurableTodosState {
  todos: TodoItem[] | null;
  carriedOver: boolean;
}

export interface DurableTodosView {
  todos: TodoItem[];
  carriedOver: boolean;
}

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionStateMap {
    "durable-todos/todos": DurableTodosState;
  }
  interface SessionProjectionMap {
    "durable-todos/todos": DurableTodosView | null;
  }
}

const stateSchema = z.object({
  todos: z.array(
    z.object({
      content: z.string(),
      status: z.enum(["pending", "in_progress", "completed"]),
    }),
  ),
  carriedOver: z.boolean(),
});

const viewSchema = z
  .object({
    todos: z.array(
      z.object({
        content: z.string(),
        status: z.enum(["pending", "in_progress", "completed"]),
      }),
    ),
    carriedOver: z.boolean(),
  })
  .nullable();

export const durableTodosProjection: ProjectionDefinition<
  typeof DURABLE_TODOS_KEY,
  DurableTodosState
> = {
  key: DURABLE_TODOS_KEY,
  stateVersion: 1,
  stateSchema: stateSchema as never,
  init(): DurableTodosState {
    return { todos: null, carriedOver: false };
  },
  apply(state: DurableTodosState, event: SessionEvent): DurableTodosState {
    if (event.type === "todo/write") {
      return { todos: event.data.todos as TodoItem[], carriedOver: false };
    }
    if (event.type === "turn/start") {
      if (state.todos === null || state.carriedOver) return state;
      return { todos: state.todos, carriedOver: true };
    }
    return state;
  },
  wire: {
    viewSchema: viewSchema as never,
    view(state: DurableTodosState): DurableTodosView | null {
      if (state.todos === null) return null;
      return { todos: state.todos, carriedOver: state.carriedOver };
    },
  },
};
