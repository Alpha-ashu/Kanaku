import { todoRepository } from './todo.repository';
import { prisma } from '../../db/prisma';
import { getSocketManager } from '../../sockets';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { inviteParticipants } from '../collaboration/invitation.service';

export class TodoService {
  // Helpers for socket notification
  private notifyParticipants(listId: number, shares: any[], owner: any[]) {
    const socketManager = getSocketManager();
    const notifyUserIds = new Set<string>();
    if (owner && owner[0]) notifyUserIds.add(owner[0].userId);
    if (shares) {
      shares.forEach((s) => notifyUserIds.add(s.sharedWithUserId));
    }

    notifyUserIds.forEach((targetId) => {
      try {
        socketManager.notifyUser(targetId, 'todo_updated', { listId });
      } catch (err) {
        // Ignore socket delivery errors
      }
    });
  }

  // Legacy single todos
  async getTodos(userId: string) {
    return todoRepository.findTodos(userId);
  }

  async createTodo(userId: string, data: { title: string; completed?: boolean }) {
    if (!data.title) {
      throw AppError.badRequest('Title is required', 'MISSING_TITLE');
    }
    return todoRepository.createTodo(userId, data.title, data.completed ?? false);
  }

  async updateTodo(id: string, userId: string, data: { title?: string; completed?: boolean }) {
    const existing = await todoRepository.findTodoFirst(id, userId);
    if (!existing) {
      throw AppError.notFound('Todo');
    }

    return todoRepository.updateTodo(
      id,
      data.title ?? existing.title,
      data.completed ?? existing.completed
    );
  }

  async deleteTodo(id: string, userId: string) {
    const existing = await todoRepository.findTodoFirst(id, userId);
    if (!existing) {
      throw AppError.notFound('Todo');
    }

    await todoRepository.deleteTodo(id);
  }

  // Shared Todo Lists
  async getTodoLists(userId: string) {
    return todoRepository.findLists(userId);
  }

  async createTodoList(userId: string, data: { name: string; description?: string }) {
    if (!data.name) {
      throw AppError.badRequest('Name is required', 'MISSING_NAME');
    }
    const lists = await todoRepository.createList(userId, data.name, data.description);
    return lists[0];
  }

  async updateTodoList(id: number, userId: string, data: { name?: string; description?: string; archived?: boolean }) {
    const lists = await todoRepository.updateList(id, userId, data.name, data.description, data.archived);
    if (lists.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Todo list not found or access denied');
    }

    // Emit socket notifications to all participants of this list
    const shares = await todoRepository.findListShares(id);
    const owner = await todoRepository.findListOwner(id);
    this.notifyParticipants(id, shares, owner);

    return lists[0];
  }

  async deleteTodoList(id: number, userId: string) {
    // Verify ownership
    const lists = await todoRepository.findListByIdAndUser(id, userId);
    if (lists.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Todo list not found or access denied');
    }

    // Get shares before deleting
    const shares = await todoRepository.findListShares(id);

    await todoRepository.deleteList(id, userId);

    // Notify participants
    const socketManager = getSocketManager();
    shares.forEach((s) => {
      try {
        socketManager.notifyUser(s.sharedWithUserId, 'todo_updated', { listId: id });
      } catch (err) {
        // Ignore
      }
    });
  }

  // Items
  async getTodoItems(listId: number) {
    return todoRepository.findListItems(listId);
  }

  async getAllTodoItems(userId: string) {
    return todoRepository.findAllListItems(userId);
  }

  async createTodoItem(
    userId: string,
    data: {
      listId: number;
      title: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: string;
    }
  ) {
    if (!data.title) {
      throw AppError.badRequest('Title is required', 'MISSING_TITLE');
    }
    const items = await todoRepository.createItem(
      data.listId,
      userId,
      data.title,
      data.description,
      data.priority,
      data.dueDate
    );

    // Notify participants
    const shares = await todoRepository.findListShares(data.listId);
    const owner = await todoRepository.findListOwner(data.listId);
    this.notifyParticipants(data.listId, shares, owner);

    return items[0];
  }

  async updateTodoItem(
    id: number,
    data: {
      title?: string;
      description?: string;
      completed?: boolean;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: string;
    }
  ) {
    const items = await todoRepository.updateItem(
      id,
      data.title,
      data.description,
      data.completed,
      data.priority,
      data.dueDate
    );

    if (items.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Todo item not found');
    }

    const item = items[0];

    // Notify participants
    const shares = await todoRepository.findListShares(item.listId);
    const owner = await todoRepository.findListOwner(item.listId);
    this.notifyParticipants(item.listId, shares, owner);

    return item;
  }

  async deleteTodoItem(id: number) {
    const items = await todoRepository.findItemById(id);
    if (items.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Todo item not found');
    }

    const item = items[0];

    await todoRepository.deleteItem(id);

    // Notify participants
    const shares = await todoRepository.findListShares(item.listId);
    const owner = await todoRepository.findListOwner(item.listId);
    this.notifyParticipants(item.listId, shares, owner);
  }

  // Shares
  async getTodoListShares(userId: string) {
    return todoRepository.findShares(userId);
  }

  async shareTodoList(
    userId: string,
    listId: number,
    data: { sharedWithEmail: string; permission?: 'view' | 'edit' }
  ) {
    const { sharedWithEmail, permission = 'view' } = data;

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw AppError.notFound('User');
    }

    const normalizedEmail = sharedWithEmail.trim().toLowerCase();
    const targetUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' }, status: 'verified' },
    });

    // Check list details and ownership/permissions
    const lists = await todoRepository.findListDetails(listId);
    if (lists.length === 0) {
      throw AppError.notFound('Todo list');
    }
    const list = lists[0];

    if (list.ownerId !== userId) {
      const editShares = await todoRepository.findEditShares(listId, userId);
      if (editShares.length === 0) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Access denied: You do not own or have permission to edit this list'
        );
      }
    }

    const listName = list.name;

    // Resolves registered vs. pending, tracks the invite, and sends the
    // matching in-app notification or "Join Kanaku" invitation email.
    await inviteParticipants({
      moduleType: 'todo_list',
      moduleId: String(listId),
      moduleName: listName,
      creatorId: userId,
      participants: [{ email: normalizedEmail }],
    });

    if (!targetUser) {
      // No registered user yet — the share row is created once they register
      // and the deferred-invitation auto-link runs (see linkPendingInvitationsForUser).
      return { listId, sharedWithEmail: normalizedEmail, permission, status: 'PENDING_REGISTRATION' };
    }

    const shares = await todoRepository.createShare(listId, targetUser.id, userId, permission);

    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(targetUser.id, 'todo_updated', { listId });
    } catch (err) {
      // Ignore
    }

    return shares[0];
  }

  async deleteTodoListShare(id: number, userId: string) {
    const shares = await todoRepository.findShareById(id);
    if (shares.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Share not found');
    }

    const share = shares[0];

    // Check list owner
    const ownerResult = await todoRepository.findListOwner(share.listId);
    const listOwnerId = ownerResult.length > 0 ? ownerResult[0].userId : null;

    if (userId !== share.sharedWithUserId && userId !== share.sharedBy && userId !== listOwnerId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Access denied: You do not have permission to delete this share'
      );
    }

    await todoRepository.deleteShare(id);

    // Notify B that share was removed
    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(share.sharedWithUserId, 'todo_updated', { listId: share.listId });
    } catch (err) {
      // Ignore
    }
  }

  async updateTodoListShare(id: number, userId: string, permission: 'view' | 'edit') {
    const existingShares = await todoRepository.findShareById(id);
    if (existingShares.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Share not found');
    }
    const shareInfo = existingShares[0];

    // Check list owner
    const ownerResult = await todoRepository.findListOwner(shareInfo.listId);
    const listOwnerId = ownerResult.length > 0 ? ownerResult[0].userId : null;

    if (userId !== shareInfo.sharedBy && userId !== listOwnerId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Access denied: You do not have permission to update this share'
      );
    }

    const shares = await todoRepository.updateShare(id, permission);

    const share = shares[0];

    // Notify
    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(share.sharedWithUserId, 'todo_updated', { listId: share.listId });
    } catch (err) {
      // Ignore
    }

    return share;
  }
}

export const todoService = new TodoService();
