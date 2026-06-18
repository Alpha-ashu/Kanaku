# todos module

> To-do lists with collaboration/sharing.

**Base path:** `/api/v1/todos`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/todos` | auth | `TodoController.getTodos` |
| POST | `/todos` | auth, validated | `TodoController.createTodo` |
| PUT | `/todos/:id` | auth, validated | `TodoController.updateTodo` |
| DELETE | `/todos/:id` | auth, validated | `TodoController.deleteTodo` |
| GET | `/todos/lists` | auth | `TodoController.getTodoLists` |
| POST | `/todos/lists` | auth | `TodoController.createTodoList` |
| PUT | `/todos/lists/:id` | auth | `TodoController.updateTodoList` |
| DELETE | `/todos/lists/:id` | auth | `TodoController.deleteTodoList` |
| GET | `/todos/items` | auth | `TodoController.getAllTodoItems` |
| GET | `/todos/lists/:listId/items` | auth | `TodoController.getTodoItems` |
| POST | `/todos/items` | auth | `TodoController.createTodoItem` |
| PUT | `/todos/items/:id` | auth | `TodoController.updateTodoItem` |
| DELETE | `/todos/items/:id` | auth | `TodoController.deleteTodoItem` |
| GET | `/todos/shares` | auth | `TodoController.getTodoListShares` |
| POST | `/todos/lists/:listId/share` | auth | `TodoController.shareTodoList` |
| PUT | `/todos/shares/:id` | auth | `TodoController.updateTodoListShare` |
| DELETE | `/todos/shares/:id` | auth | `TodoController.deleteTodoListShare` |

## Files

- `README.md`
- `todo.controller.ts`
- `todo.repository.ts`
- `todo.routes.ts`
- `todo.service.ts`
- `todo.validation.ts`

## Canonical-shape conformance

✅ controller · ✅ service · ✅ repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `todos/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
