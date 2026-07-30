import { prisma } from '../../db/prisma';

let todoTablesEnsured = false;

export async function ensureTodoTablesExist() {
  if (todoTablesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.todo_lists (
        id          BIGSERIAL PRIMARY KEY,
        user_id     UUID NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        archived    BOOLEAN DEFAULT false,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.todo_items (
        id           BIGSERIAL PRIMARY KEY,
        list_id      BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
        user_id      UUID NOT NULL,
        title        TEXT NOT NULL,
        description  TEXT,
        completed    BOOLEAN DEFAULT false,
        priority     TEXT CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
        due_date     TIMESTAMPTZ,
        created_by   UUID,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS public.todo_list_shares (
        id                  BIGSERIAL PRIMARY KEY,
        list_id             BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
        shared_with_user_id UUID NOT NULL,
        shared_by           UUID NOT NULL,
        permission          TEXT CHECK (permission IN ('view','edit')) DEFAULT 'view',
        shared_at           TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(list_id, shared_with_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_todo_lists_user_id ON public.todo_lists(user_id);
      CREATE INDEX IF NOT EXISTS idx_todo_items_list_id ON public.todo_items(list_id);
    `);
    todoTablesEnsured = true;
  } catch (err) {
    // Silently continue if DDL fails (e.g. read-only replica)
  }
}

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
    await ensureTodoTablesExist();
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.todo_lists
      WHERE user_id = ${userId}::uuid OR id IN (
        SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}::uuid
      )
      ORDER BY created_at DESC
    `;
  }

  async createList(userId: string, name: string, description?: string) {
    await ensureTodoTablesExist();
    return prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_lists (user_id, name, description, archived, created_at, updated_at)
      VALUES (${userId}::uuid, ${name}, ${description || null}, false, NOW(), NOW())
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
      WHERE id = ${id}::bigint AND (user_id = ${userId}::uuid OR id IN (
        SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}::uuid AND permission = 'edit'
      ))
      RETURNING id::INT, user_id AS "userId", name, description, archived, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
  }

  async findListByIdAndUser(id: number, userId: string) {
    return prisma.$queryRaw<any[]>`
      SELECT id FROM public.todo_lists WHERE id = ${id}::bigint AND user_id = ${userId}::uuid
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
      DELETE FROM public.todo_lists WHERE id = ${id}::bigint AND user_id = ${userId}::uuid
    `;
  }

  async findListItems(listId: number) {
    await ensureTodoTablesExist();
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM public.todo_items
      WHERE list_id = ${listId}::bigint
      ORDER BY created_at ASC
    `;
  }

  async findAllListItems(userId: string) {
    await ensureTodoTablesExist();
    return prisma.$queryRaw<any[]>`
      SELECT id::INT, list_id::INT AS "listId", user_id AS "userId", title, description, completed, priority, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM public.todo_items
      WHERE list_id IN (
        SELECT id FROM public.todo_lists WHERE user_id = ${userId}::uuid OR id IN (
          SELECT list_id FROM public.todo_list_shares WHERE shared_with_user_id = ${userId}::uuid
        )
      )
      ORDER BY created_at ASC
    `;
  }

  async createItem(listId: number, userId: string, title: string, description?: string, priority?: string, dueDate?: string) {
    await ensureTodoTablesExist();
    return prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_items (list_id, user_id, title, description, completed, priority, due_date, created_by, created_at, updated_at)
      VALUES (${listId}::bigint, ${userId}::uuid, ${title}, ${description || null}, false, ${priority || 'medium'}, ${dueDate ? new Date(dueDate) : null}, ${userId}::uuid, NOW(), NOW())
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
      WHERE shared_with_user_id = ${userId}::uuid OR list_id IN (
        SELECT id FROM public.todo_lists WHERE user_id = ${userId}::uuid
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
      WHERE list_id = ${listId}::bigint AND shared_with_user_id = ${userId}::uuid AND permission = 'edit'
    `;
  }

  async createShare(listId: number, targetUserId: string, sharedBy: string, permission: string) {
    return prisma.$queryRaw<any[]>`
      INSERT INTO public.todo_list_shares (list_id, shared_with_user_id, shared_by, permission, shared_at)
      VALUES (${listId}::bigint, ${targetUserId}::uuid, ${sharedBy}::uuid, ${permission}, NOW())
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
