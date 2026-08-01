/**
 * Advisor feed: published updates, likes, and the follow graph behind the
 * Discover and Following tabs.
 *
 * Everything here is scoped by the caller's identity: a post is authored by the
 * advisor who owns it, a like belongs to the user who tapped it, and the
 * Following feed is the caller's own follow edges. Nothing is derived from
 * client-supplied ids beyond the resource being addressed.
 */
import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

const MAX_FEED_ITEMS = 50;
/** Cap on the fan-out of "new post" notifications per publish. */
const MAX_FOLLOWER_NOTIFICATIONS = 500;

const dbOffline = (res: Response) =>
  res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });

interface PostRow {
  id: string;
  advisorId: string;
  category: string;
  title: string;
  content: string;
  createdAt: Date;
  advisor: { id: string; name: string; avatarId: string | null; advisorApplication: { organizationName: string | null; expertise: string | null } | null };
  _count: { likes: number };
  likes: Array<{ id: string }>;
}

const serializePost = (post: PostRow) => ({
  id: post.id,
  advisorId: post.advisorId,
  advisorName: post.advisor.name,
  advisorAvatarId: post.advisor.avatarId,
  advisorTitle:
    post.advisor.advisorApplication?.organizationName?.trim()
    || post.advisor.advisorApplication?.expertise?.split(',')[0]?.trim()
    || 'Financial Advisor',
  category: post.category,
  title: post.title,
  content: post.content,
  createdAt: post.createdAt,
  likes: post._count.likes,
  // `likes` is filtered to the caller by the query, so a non-empty array means
  // "I liked this" — no second round-trip and no leaking who else liked it.
  liked: post.likes.length > 0,
});

export const listPosts = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const followingOnly = String(req.query.following ?? '') === 'true';
    const advisorId = typeof req.query.advisorId === 'string' ? req.query.advisorId : undefined;

    let advisorFilter: { in: string[] } | string | undefined = advisorId;
    if (followingOnly) {
      const follows = await prisma.advisorFollow.findMany({
        where: { followerId: userId },
        select: { advisorId: true },
      });
      if (follows.length === 0) {
        return res.json([]);
      }
      advisorFilter = { in: follows.map((follow) => follow.advisorId) };
    }

    const posts = await prisma.advisorPost.findMany({
      where: {
        deletedAt: null,
        ...(advisorFilter ? { advisorId: advisorFilter as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_FEED_ITEMS,
      include: {
        advisor: {
          select: {
            id: true,
            name: true,
            avatarId: true,
            advisorApplication: { select: { organizationName: true, expertise: true } },
          },
        },
        _count: { select: { likes: true } },
        likes: { where: { userId }, select: { id: true } },
      },
    });

    res.json(posts.map((post) => serializePost(post as unknown as PostRow)));
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    logger.error('Failed to list advisor posts', { error: error.message });
    res.status(500).json({ error: 'Failed to load the advisor feed' });
  }
};

export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { category, title, content } = req.body ?? {};

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const post = await prisma.advisorPost.create({
      data: {
        advisorId,
        category: (category ?? 'Update').toString().trim().slice(0, 60) || 'Update',
        title: title.trim().slice(0, 160),
        content: content.trim().slice(0, 5000),
      },
      include: {
        advisor: {
          select: {
            id: true,
            name: true,
            avatarId: true,
            advisorApplication: { select: { organizationName: true, expertise: true } },
          },
        },
        _count: { select: { likes: true } },
        likes: { where: { userId: advisorId }, select: { id: true } },
      },
    });

    // Following is only worth anything if it delivers something. Followers get a
    // durable notification, which is also what the client's notification sync
    // already reads — no new delivery channel needed.
    const followers = await prisma.advisorFollow.findMany({
      where: { advisorId },
      select: { followerId: true },
      take: MAX_FOLLOWER_NOTIFICATIONS,
    });

    if (followers.length > 0) {
      await prisma.notification.createMany({
        data: followers.map((follower) => ({
          userId: follower.followerId,
          title: `${post.advisor.name} posted an update`,
          message: post.title,
          category: 'advisor',
          deepLink: '/book-advisor',
        })),
      });
    }

    res.status(201).json(serializePost(post as unknown as PostRow));
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    logger.error('Failed to create advisor post', { error: error.message });
    res.status(500).json({ error: 'Failed to publish the update' });
  }
};

export const deletePost = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;

    const post = await prisma.advisorPost.findFirst({ where: { id, advisorId, deletedAt: null } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await prisma.advisorPost.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    res.status(500).json({ error: 'Failed to delete the update' });
  }
};

export const likePost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const post = await prisma.advisorPost.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Idempotent: a repeated tap (or a retried request) is not a second like.
    await prisma.advisorPostLike.upsert({
      where: { postId_userId: { postId: id, userId } },
      create: { postId: id, userId },
      update: {},
    });

    const likes = await prisma.advisorPostLike.count({ where: { postId: id } });
    res.json({ liked: true, likes });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    res.status(500).json({ error: 'Failed to like the update' });
  }
};

export const unlikePost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    await prisma.advisorPostLike.deleteMany({ where: { postId: id, userId } });
    const likes = await prisma.advisorPostLike.count({ where: { postId: id } });
    res.json({ liked: false, likes });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    res.status(500).json({ error: 'Failed to remove the like' });
  }
};

// ─── Follow graph ────────────────────────────────────────────────────────────

export const listFollowing = async (req: AuthRequest, res: Response) => {
  try {
    const followerId = getUserId(req);
    const follows = await prisma.advisorFollow.findMany({
      where: { followerId },
      select: { advisorId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(follows.map((follow) => ({ advisorId: follow.advisorId, followedAt: follow.createdAt })));
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    res.status(500).json({ error: 'Failed to load followed advisors' });
  }
};

export const followAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const followerId = getUserId(req);
    const { id: advisorId } = req.params;

    if (advisorId === followerId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    const advisor = await prisma.user.findFirst({
      where: { id: advisorId, role: 'advisor', isApproved: true },
      select: { id: true },
    });
    if (!advisor) {
      return res.status(404).json({ error: 'Advisor not found' });
    }

    await prisma.advisorFollow.upsert({
      where: { advisorId_followerId: { advisorId, followerId } },
      create: { advisorId, followerId },
      update: {},
    });

    const followersCount = await prisma.advisorFollow.count({ where: { advisorId } });
    res.json({ following: true, followersCount });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    res.status(500).json({ error: 'Failed to follow the advisor' });
  }
};

export const unfollowAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const followerId = getUserId(req);
    const { id: advisorId } = req.params;

    await prisma.advisorFollow.deleteMany({ where: { advisorId, followerId } });
    const followersCount = await prisma.advisorFollow.count({ where: { advisorId } });
    res.json({ following: false, followersCount });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) return dbOffline(res);
    res.status(500).json({ error: 'Failed to unfollow the advisor' });
  }
};
