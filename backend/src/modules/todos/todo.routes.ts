import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import * as TodoController from './todo.controller';
import { todoCreateSchema, todoIdParamSchema, todoUpdateSchema } from './todo.validation';

const router = Router();

router.use(authMiddleware);

// Legacy single todo routes
router.get('/', TodoController.getTodos);
router.post('/', validateBody(todoCreateSchema), TodoController.createTodo);
router.put('/:id', validateParams(todoIdParamSchema), validateBody(todoUpdateSchema), TodoController.updateTodo);
router.delete('/:id', validateParams(todoIdParamSchema), TodoController.deleteTodo);

// Shared ToDo Lists routes
router.get('/lists', TodoController.getTodoLists);
router.post('/lists', TodoController.createTodoList);
router.put('/lists/:id', TodoController.updateTodoList);
router.delete('/lists/:id', TodoController.deleteTodoList);

// Items routes
router.get('/items', TodoController.getAllTodoItems);
router.get('/lists/:listId/items', TodoController.getTodoItems);
router.post('/items', TodoController.createTodoItem);
router.put('/items/:id', TodoController.updateTodoItem);
router.delete('/items/:id', TodoController.deleteTodoItem);

// Share routes
router.get('/shares', TodoController.getTodoListShares);
router.post('/lists/:listId/share', TodoController.shareTodoList);
router.put('/shares/:id', TodoController.updateTodoListShare);
router.delete('/shares/:id', TodoController.deleteTodoListShare);

export { router as todoRoutes };

