import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { idempotency } from '../../middleware/idempotency';
import * as TodoController from './todo.controller';
import { todoCreateSchema, todoIdParamSchema, todoUpdateSchema } from './todo.validation';

const router = Router();

router.use(authMiddleware);
router.use(requireFeature('todoLists'));

// Legacy single todo routes
router.get('/', TodoController.getTodos);
router.post(
  '/',
  idempotency({ scope: 'todos.create' }),
  validateBody(todoCreateSchema),
  TodoController.createTodo,
);
router.put(
  '/:id',
  idempotency({ scope: 'todos.update' }),
  validateParams(todoIdParamSchema),
  validateBody(todoUpdateSchema),
  TodoController.updateTodo,
);
router.delete('/:id', validateParams(todoIdParamSchema), TodoController.deleteTodo);

// Shared ToDo Lists routes
router.get('/lists', TodoController.getTodoLists);
router.post('/lists', idempotency({ scope: 'todos.list.create' }), TodoController.createTodoList);
router.put('/lists/:id', idempotency({ scope: 'todos.list.update' }), TodoController.updateTodoList);
router.delete('/lists/:id', TodoController.deleteTodoList);

// Items routes
router.get('/items', TodoController.getAllTodoItems);
router.get('/lists/:listId/items', TodoController.getTodoItems);
router.post('/items', idempotency({ scope: 'todos.item.create' }), TodoController.createTodoItem);
router.put('/items/:id', idempotency({ scope: 'todos.item.update' }), TodoController.updateTodoItem);
router.delete('/items/:id', TodoController.deleteTodoItem);

// Share routes
router.get('/shares', TodoController.getTodoListShares);
router.post('/lists/:listId/share', idempotency({ scope: 'todos.share.create' }), TodoController.shareTodoList);
router.put('/shares/:id', idempotency({ scope: 'todos.share.update' }), TodoController.updateTodoListShare);
router.delete('/shares/:id', TodoController.deleteTodoListShare);

export { router as todoRoutes };


