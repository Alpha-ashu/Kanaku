import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { todoService } from './todo.service';

// Legacy single todo controllers
export const getTodos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const todos = await todoService.getTodos(userId);
    res.json({ success: true, data: todos });
  } catch (error) {
    next(error);
  }
};

export const createTodo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const todo = await todoService.createTodo(userId, req.body);
    res.status(201).json({ success: true, data: todo });
  } catch (error) {
    next(error);
  }
};

export const updateTodo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const updated = await todoService.updateTodo(id, userId, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteTodo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    await todoService.deleteTodo(id, userId);
    res.json({ success: true, message: 'Todo deleted' });
  } catch (error) {
    next(error);
  }
};

// Shared ToDo Lists controllers
export const getTodoLists = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const lists = await todoService.getTodoLists(userId);
    res.json({ success: true, data: lists });
  } catch (error) {
    next(error);
  }
};

export const createTodoList = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const list = await todoService.createTodoList(userId, req.body);
    res.status(201).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const updateTodoList = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const list = await todoService.updateTodoList(parseInt(id), userId, req.body);
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const deleteTodoList = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    await todoService.deleteTodoList(parseInt(id), userId);
    res.json({ success: true, message: 'Todo list deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getTodoItems = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { listId } = req.params;
    const items = await todoService.getTodoItems(parseInt(listId));
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

export const getAllTodoItems = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const items = await todoService.getAllTodoItems(userId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

export const createTodoItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { listId, title, description, priority, dueDate } = req.body;
    const parsedListId = typeof listId === 'string' ? parseInt(listId) : listId;

    const item = await todoService.createTodoItem(userId, {
      listId: parsedListId,
      title,
      description,
      priority,
      dueDate,
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const updateTodoItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const item = await todoService.updateTodoItem(parseInt(id), req.body);
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const deleteTodoItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await todoService.deleteTodoItem(parseInt(id));
    res.json({ success: true, message: 'Todo item deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getTodoListShares = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const shares = await todoService.getTodoListShares(userId);
    res.json({ success: true, data: shares });
  } catch (error) {
    next(error);
  }
};

export const shareTodoList = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { listId } = req.params;
    const share = await todoService.shareTodoList(userId, parseInt(listId), req.body);
    res.status(201).json({ success: true, data: share });
  } catch (error) {
    next(error);
  }
};

export const deleteTodoListShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    await todoService.deleteTodoListShare(parseInt(id), userId);
    res.json({ success: true, message: 'Share removed successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateTodoListShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { permission } = req.body;
    const share = await todoService.updateTodoListShare(parseInt(id), userId, permission);
    res.json({ success: true, data: share });
  } catch (error) {
    next(error);
  }
};
