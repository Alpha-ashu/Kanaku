import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

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
