import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { getSocketManager } from '../../sockets';
import { logger } from '../../config/logger';

// Legacy single todo controllers
export const getTodos = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    const todos = await prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: todos });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch todos' });
  }
};

export const createTodo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { title, completed } = req.body as { title: string; completed?: boolean };

    const todo = await prisma.todo.create({
      data: {
        userId,
        title,
        completed: completed ?? false,
      },
    });

    res.status(201).json({ success: true, data: todo });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create todo' });
  }
};

export const updateTodo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body as { title?: string; completed?: boolean };

    const existing = await prisma.todo.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Todo not found' });
    }

    const updated = await prisma.todo.update({
      where: { id },
      data: {
        title: body.title ?? existing.title,
        completed: body.completed ?? existing.completed,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update todo' });
  }
};

export const deleteTodo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.todo.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Todo not found' });
    }

    await prisma.todo.delete({ where: { id } });

    res.json({ success: true, message: 'Todo deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete todo' });
  }
};

// ==========================================
// Shared ToDo Lists controllers (Direct PostgreSQL / Raw Query mode)
// ==========================================

export const getTodoLists = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const lists = await prisma.$queryRaw<any[]>`
      SELECT id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.todo_lists
      WHERE user_id = ${userId}::uuid OR id IN (
        SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}::uuid
      )
      ORDER BY created_at DESC
    `;
    res.json({ success: true, data: lists });
  } catch (error) {
    logger.error('Failed to get todo lists', error);
    res.status(500).json({ success: false, error: 'Failed to fetch todo lists' });
  }
};

export const createTodoList = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body as { name: string; description?: string };

    const lists = await prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_lists (user_id, name, description, archived, created_at, updated_at)
      VALUES (${userId}::uuid, ${name}, ${description || null}, false, NOW(), NOW())
      RETURNING id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    res.status(201).json({ success: true, data: lists[0] });
  } catch (error) {
    logger.error('Failed to create todo list', error);
    res.status(500).json({ success: false, error: 'Failed to create todo list' });
  }
};

export const updateTodoList = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, description, archived } = req.body as { name?: string; description?: string; archived?: boolean };

    const lists = await prisma.$queryRaw<any[]>`
      UPDATE public.todo_lists
      SET name = COALESCE(${name !== undefined ? name : null}, name),
          description = COALESCE(${description !== undefined ? description : null}, description),
          archived = COALESCE(${archived !== undefined ? archived : null}, archived),
          updated_at = NOW()
      WHERE id = ${parseInt(id)}::bigint AND (user_id = ${userId}::uuid OR id IN (
        SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}::uuid AND permission = 'edit'
      ))
      RETURNING id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    if (lists.length === 0) {
      return res.status(404).json({ success: false, error: 'Todo list not found or access denied' });
    }

    // Emit socket notifications to all participants of this list
    const shares = await prisma.$queryRaw<any[]>`
      SELECT shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE list_id = ${parseInt(id)}::bigint
    `;
    const owner = await prisma.$queryRaw<any[]>`
      SELECT user_id AS "userId" FROM public.todo_lists WHERE id = ${parseInt(id)}::bigint
    `;

    const socketManager = getSocketManager();
    const notifyUserIds = new Set<string>();
    if (owner[0]) notifyUserIds.add(owner[0].userId);
    shares.forEach(s => notifyUserIds.add(s.sharedWithUserId));

    notifyUserIds.forEach(targetId => {
      try {
        socketManager.notifyUser(targetId, 'todo_updated', { listId: id });
      } catch (err) {
        // Ignore
      }
    });

    res.json({ success: true, data: lists[0] });
  } catch (error) {
    logger.error('Failed to update todo list', error);
    res.status(500).json({ success: false, error: 'Failed to update todo list' });
  }
};

export const deleteTodoList = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    // Verify ownership
    const lists = await prisma.$queryRaw<any[]>`
      SELECT id FROM public.todo_lists WHERE id = ${parseInt(id)}::bigint AND user_id = ${userId}::uuid
    `;

    if (lists.length === 0) {
      return res.status(404).json({ success: false, error: 'Todo list not found or access denied' });
    }

    // Get shares before deleting
    const shares = await prisma.$queryRaw<any[]>`
      SELECT shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE list_id = ${parseInt(id)}::bigint
    `;

    await prisma.$executeRaw`
      DELETE FROM public.todo_lists WHERE id = ${parseInt(id)}::bigint
    `;

    // Notify participants
    const socketManager = getSocketManager();
    shares.forEach(s => {
      try {
        socketManager.notifyUser(s.sharedWithUserId, 'todo_updated', { listId: id });
      } catch (err) {
        // Ignore
      }
    });

    res.json({ success: true, message: 'Todo list deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete todo list', error);
    res.status(500).json({ success: false, error: 'Failed to delete todo list' });
  }
};

export const getTodoItems = async (req: AuthRequest, res: Response) => {
  try {
    const { listId } = req.params;
    const items = await prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM public.todo_items
      WHERE list_id = ${parseInt(listId)}::bigint
      ORDER BY created_at ASC
    `;
    res.json({ success: true, data: items });
  } catch (error) {
    logger.error('Failed to get todo items', error);
    res.status(500).json({ success: false, error: 'Failed to fetch todo items' });
  }
};

export const getAllTodoItems = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const items = await prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM public.todo_items
      WHERE list_id IN (
        SELECT id FROM public.todo_lists WHERE user_id = ${userId}::uuid OR id IN (
          SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}::uuid
        )
      )
      ORDER BY created_at ASC
    `;
    res.json({ success: true, data: items });
  } catch (error) {
    logger.error('Failed to get all todo items', error);
    res.status(500).json({ success: false, error: 'Failed to fetch all todo items' });
  }
};

export const createTodoItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { listId, title, description, priority, dueDate } = req.body as {
      listId: number | string;
      title: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: string;
    };

    const parsedListId = typeof listId === 'string' ? parseInt(listId) : listId;

    const items = await prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_items (list_id, user_id, title, description, completed, priority, due_date, created_by, created_at, updated_at)
      VALUES (${parsedListId}::bigint, ${userId}::uuid, ${title}, ${description || null}, false, ${priority || 'medium'}, ${dueDate ? new Date(dueDate) : null}, ${userId}::uuid, NOW(), NOW())
      RETURNING id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    // Notify participants
    const shares = await prisma.$queryRaw<any[]>`
      SELECT shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE list_id = ${parsedListId}::bigint
    `;
    const owner = await prisma.$queryRaw<any[]>`
      SELECT user_id AS "userId" FROM public.todo_lists WHERE id = ${parsedListId}::bigint
    `;

    const socketManager = getSocketManager();
    const notifyUserIds = new Set<string>();
    if (owner[0]) notifyUserIds.add(owner[0].userId);
    shares.forEach(s => notifyUserIds.add(s.sharedWithUserId));

    notifyUserIds.forEach(targetId => {
      try {
        socketManager.notifyUser(targetId, 'todo_updated', { listId: parsedListId });
      } catch (err) {
        // Ignore
      }
    });

    res.status(201).json({ success: true, data: items[0] });
  } catch (error) {
    logger.error('Failed to create todo item', error);
    res.status(500).json({ success: false, error: 'Failed to create todo item' });
  }
};

export const updateTodoItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { title, description, completed, priority, dueDate } = req.body as {
      title?: string;
      description?: string;
      completed?: boolean;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: string;
    };

    const items = await prisma.$queryRaw<any[]>`
      UPDATE public.todo_items
      SET title = COALESCE(${title !== undefined ? title : null}, title),
          description = COALESCE(${description !== undefined ? description : null}, description),
          completed = COALESCE(${completed !== undefined ? completed : null}, completed),
          priority = COALESCE(${priority !== undefined ? priority : null}, priority),
          due_date = COALESCE(${dueDate ? new Date(dueDate) : null}, due_date),
          completed_at = CASE WHEN ${completed === true} THEN NOW() WHEN ${completed === false} THEN NULL ELSE completed_at END,
          updated_at = NOW()
      WHERE id = ${parseInt(id)}::bigint
      RETURNING id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
    `;

    if (items.length === 0) {
      return res.status(404).json({ success: false, error: 'Todo item not found' });
    }

    const item = items[0];

    // Notify participants
    const shares = await prisma.$queryRaw<any[]>`
      SELECT shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE list_id = ${item.listId}::bigint
    `;
    const owner = await prisma.$queryRaw<any[]>`
      SELECT user_id AS "userId" FROM public.todo_lists WHERE id = ${item.listId}::bigint
    `;

    const socketManager = getSocketManager();
    const notifyUserIds = new Set<string>();
    if (owner[0]) notifyUserIds.add(owner[0].userId);
    shares.forEach(s => notifyUserIds.add(s.sharedWithUserId));

    notifyUserIds.forEach(targetId => {
      try {
        socketManager.notifyUser(targetId, 'todo_updated', { listId: item.listId });
      } catch (err) {
        // Ignore
      }
    });

    res.json({ success: true, data: item });
  } catch (error) {
    logger.error('Failed to update todo item', error);
    res.status(500).json({ success: false, error: 'Failed to update todo item' });
  }
};

export const deleteTodoItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const items = await prisma.$queryRaw<any[]>`
      SELECT id, list_id::INT AS "listId" FROM public.todo_items WHERE id = ${parseInt(id)}::bigint
    `;

    if (items.length === 0) {
      return res.status(404).json({ success: false, error: 'Todo item not found' });
    }

    const item = items[0];

    await prisma.$executeRaw`
      DELETE FROM public.todo_items WHERE id = ${parseInt(id)}::bigint
    `;

    // Notify participants
    const shares = await prisma.$queryRaw<any[]>`
      SELECT shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE list_id = ${item.listId}::bigint
    `;
    const owner = await prisma.$queryRaw<any[]>`
      SELECT user_id AS "userId" FROM public.todo_lists WHERE id = ${item.listId}::bigint
    `;

    const socketManager = getSocketManager();
    const notifyUserIds = new Set<string>();
    if (owner[0]) notifyUserIds.add(owner[0].userId);
    shares.forEach(s => notifyUserIds.add(s.sharedWithUserId));

    notifyUserIds.forEach(targetId => {
      try {
        socketManager.notifyUser(targetId, 'todo_updated', { listId: item.listId });
      } catch (err) {
        // Ignore
      }
    });

    res.json({ success: true, message: 'Todo item deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete todo item', error);
    res.status(500).json({ success: false, error: 'Failed to delete todo item' });
  }
};

export const getTodoListShares = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const shares = await prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy", permission, shared_at AS "sharedAt"
      FROM public.todo_list_shares
      WHERE shared_with_user_id = ${userId}::uuid OR list_id IN (
        SELECT id FROM public.todo_lists WHERE user_id = ${userId}::uuid
      )
    `;
    res.json({ success: true, data: shares });
  } catch (error) {
    logger.error('Failed to get todo shares', error);
    res.status(500).json({ success: false, error: 'Failed to fetch shares' });
  }
};

export const shareTodoList = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { listId } = req.params;
    const { sharedWithEmail, permission = 'view' } = req.body as { sharedWithEmail: string; permission?: 'view' | 'edit' };

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check target user
    const targetUser = await prisma.user.findFirst({
      where: { email: { equals: sharedWithEmail.trim(), mode: 'insensitive' } }
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: `No registered user found with email: ${sharedWithEmail}` });
    }

    // Check list details
    const lists = await prisma.$queryRaw<any[]>`
      SELECT name FROM public.todo_lists WHERE id = ${parseInt(listId)}::bigint
    `;
    if (lists.length === 0) {
      return res.status(404).json({ success: false, error: 'Todo list not found' });
    }
    const listName = lists[0].name;

    const shares = await prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_list_shares (list_id, shared_with_user_id, shared_by, permission, shared_at)
      VALUES (${parseInt(listId)}::bigint, ${targetUser.id}::uuid, ${userId}::uuid, ${permission}, NOW())
      ON CONFLICT (list_id, shared_with_user_id) 
      DO UPDATE SET permission = EXCLUDED.permission
      RETURNING id::INT, list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy", permission, shared_at AS "sharedAt"
    `;

    // Create Notification for target user
    const notification = await prisma.notification.create({
      data: {
        userId: targetUser.id,
        sourceUserId: userId,
        title: 'Shared To-Do List',
        message: `${currentUser.name} shared a to-do list "${listName}" with you.`,
        type: 'todo_shared',
        priority: 'normal',
        channels: '["app"]',
        deliveryStatus: '{}',
      }
    });

    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(targetUser.id, 'notification', notification);
      socketManager.notifyUser(targetUser.id, 'todo_updated', { listId });
    } catch (err) {
      // Ignore
    }

    res.status(201).json({ success: true, data: shares[0] });
  } catch (error) {
    logger.error('Failed to share todo list', error);
    res.status(500).json({ success: false, error: 'Failed to share list' });
  }
};

export const deleteTodoListShare = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const shares = await prisma.$queryRaw<any[]>`
      SELECT list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE id = ${parseInt(id)}::bigint
    `;

    if (shares.length === 0) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    const share = shares[0];

    await prisma.$executeRaw`
      DELETE FROM public.todo_list_shares WHERE id = ${parseInt(id)}::bigint
    `;

    // Notify B that share was removed
    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(share.sharedWithUserId, 'todo_updated', { listId: share.listId });
    } catch (err) {
      // Ignore
    }

    res.json({ success: true, message: 'Share removed successfully' });
  } catch (error) {
    logger.error('Failed to delete share', error);
    res.status(500).json({ success: false, error: 'Failed to delete share' });
  }
};

export const updateTodoListShare = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { permission } = req.body as { permission: 'view' | 'edit' };

    const shares = await prisma.$queryRaw<any[]>`
      UPDATE public.todo_list_shares
      SET permission = ${permission}
      WHERE id = ${parseInt(id)}::bigint
      RETURNING id::INT, list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy", permission, shared_at AS "sharedAt"
    `;

    if (shares.length === 0) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    const share = shares[0];

    // Notify
    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(share.sharedWithUserId, 'todo_updated', { listId: share.listId });
    } catch (err) {
      // Ignore
    }

    res.json({ success: true, data: share });
  } catch (error) {
    logger.error('Failed to update share', error);
    res.status(500).json({ success: false, error: 'Failed to update share' });
  }
};
