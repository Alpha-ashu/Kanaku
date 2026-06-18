import { prisma } from '../../db/prisma';

export class TodoRepository {
  // Legacy Single Todos
  async findTodos(userId: string) {
    return prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTodoFirst(id: string, userId: string) {
    return prisma.todo.findFirst({
      where: { id, userId },
    });
  }

  async createTodo(userId: string, title: string, completed: boolean) {
    return prisma.todo.create({
      data: {
        userId,
        title,
        completed,
      },
    });
  }

  async updateTodo(id: string, title: string, completed: boolean) {
    return prisma.todo.update({
      where: { id },
      data: {
        title,
        completed,
        updatedAt: new Date(),
      },
    });
  }

  async deleteTodo(id: string) {
    return prisma.todo.delete({
      where: { id },
    });
  }

  // Shared Todo Lists
  async findLists(userId: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.todo_lists
      WHERE user_id = ${userId} OR id IN (
        SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}
      )
      ORDER BY created_at DESC
    `;
  }

  async createList(userId: string, name: string, description?: string) {
    return prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_lists (user_id, name, description, archived, created_at, updated_at)
      VALUES (${userId}, ${name}, ${description || null}, false, NOW(), NOW())
      RETURNING id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
  }

  async updateList(id: number, userId: string, name?: string, description?: string, archived?: boolean) {
    return prisma.$queryRaw<any[]>`
      UPDATE public.todo_lists
      SET name = COALESCE(${name !== undefined ? name : null}, name),
          description = COALESCE(${description !== undefined ? description : null}, description),
          archived = COALESCE(${archived !== undefined ? archived : null}, archived),
          updated_at = NOW()
      WHERE id = ${id}::bigint AND (user_id = ${userId} OR id IN (
        SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId} AND permission = 'edit'
      ))
      RETURNING id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
  }

  async findListByIdAndUser(id: number, userId: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id FROM public.todo_lists WHERE id = ${id}::bigint AND user_id = ${userId}
    `;
  }

  async findListShares(listId: number) {
    return prisma.$queryRaw<any[]>`
      SELECT shared_with_user_id AS "sharedWithUserId" FROM public.todo_list_shares WHERE list_id = ${listId}::bigint
    `;
  }

  async findListOwner(listId: number) {
    return prisma.$queryRaw<any[]>`
      SELECT user_id AS "userId" FROM public.todo_lists WHERE id = ${listId}::bigint
    `;
  }

  async deleteList(id: number, userId: string) {
    // Scope the delete to the owning user so this is safe even if the
    // service-layer ownership check is ever bypassed (defense-in-depth).
    return prisma.$executeRaw`
      DELETE FROM public.todo_lists WHERE id = ${id}::bigint AND user_id = ${userId}
    `;
  }

  async findListItems(listId: number) {
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM public.todo_items
      WHERE list_id = ${listId}::bigint
      ORDER BY created_at ASC
    `;
  }

  async findAllListItems(userId: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM public.todo_items
      WHERE list_id IN (
        SELECT id FROM public.todo_lists WHERE user_id = ${userId} OR id IN (
          SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}
        )
      )
      ORDER BY created_at ASC
    `;
  }

  async createItem(listId: number, userId: string, title: string, description?: string, priority?: string, dueDate?: string) {
    return prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_items (list_id, user_id, title, description, completed, priority, due_date, created_by, created_at, updated_at)
      VALUES (${listId}::bigint, ${userId}, ${title}, ${description || null}, false, ${priority || 'medium'}, ${dueDate ? new Date(dueDate) : null}, ${userId}, NOW(), NOW())
      RETURNING id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    `;
  }

  async updateItem(id: number, title?: string, description?: string, completed?: boolean, priority?: string, dueDate?: string) {
    return prisma.$queryRaw<any[]>`
      UPDATE public.todo_items
      SET title = COALESCE(${title !== undefined ? title : null}, title),
          description = COALESCE(${description !== undefined ? description : null}, description),
          completed = COALESCE(${completed !== undefined ? completed : null}, completed),
          priority = COALESCE(${priority !== undefined ? priority : null}, priority),
          due_date = COALESCE(${dueDate ? new Date(dueDate) : null}, due_date),
          completed_at = CASE WHEN ${completed === true} THEN NOW() WHEN ${completed === false} THEN NULL ELSE completed_at END,
          updated_at = NOW()
      WHERE id = ${id}::bigint
      RETURNING id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
    `;
  }

  async findItemById(id: number) {
    return prisma.$queryRaw<any[]>`
      SELECT id, list_id::INT AS "listId" FROM public.todo_items WHERE id = ${id}::bigint
    `;
  }

  async deleteItem(id: number) {
    return prisma.$executeRaw`
      DELETE FROM public.todo_items WHERE id = ${id}::bigint
    `;
  }

  async findShares(userId: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy", permission, shared_at AS "sharedAt"
      FROM public.todo_list_shares
      WHERE shared_with_user_id = ${userId} OR list_id IN (
        SELECT id FROM public.todo_lists WHERE user_id = ${userId}
      )
    `;
  }

  async findListDetails(listId: number) {
    return prisma.$queryRaw<any[]>`
      SELECT name, user_id AS "ownerId" FROM public.todo_lists WHERE id = ${listId}::bigint
    `;
  }

  async findEditShares(listId: number, userId: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id FROM public.todo_list_shares 
      WHERE list_id = ${listId}::bigint AND shared_with_user_id = ${userId} AND permission = 'edit'
    `;
  }

  async createShare(listId: number, targetUserId: string, sharedBy: string, permission: string) {
    return prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_list_shares (list_id, shared_with_user_id, shared_by, permission, shared_at)
      VALUES (${listId}::bigint, ${targetUserId}, ${sharedBy}, ${permission}, NOW())
      ON CONFLICT (list_id, shared_with_user_id) 
      DO UPDATE SET permission = EXCLUDED.permission
      RETURNING id::INT, list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy", permission, shared_at AS "sharedAt"
    `;
  }

  async findShareById(id: number) {
    return prisma.$queryRaw<any[]>`
      SELECT list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy" FROM public.todo_list_shares WHERE id = ${id}::bigint
    `;
  }

  async deleteShare(id: number) {
    return prisma.$executeRaw`
      DELETE FROM public.todo_list_shares WHERE id = ${id}::bigint
    `;
  }

  async updateShare(id: number, permission: string) {
    return prisma.$queryRaw<any[]>`
      UPDATE public.todo_list_shares
      SET permission = ${permission}
      WHERE id = ${id}::bigint
      RETURNING id::INT, list_id::INT AS "listId", shared_with_user_id AS "sharedWithUserId", shared_by AS "sharedBy", permission, shared_at AS "sharedAt"
    `;
  }
}

export const todoRepository = new TodoRepository();
