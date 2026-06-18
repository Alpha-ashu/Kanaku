# friends module

> Friends list and friend requests.

**Base path:** `/api/v1/friends`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/friends` | auth | `FriendController.getFriends` |
| POST | `/friends` | auth, validated | `FriendController.createFriend` |
| POST | `/friends/bulk` | auth, validated | `FriendController.bulkCreateFriends` |
| POST | `/friends/import` | auth | `FriendController.importFriendsCsv` |
| GET | `/friends/:id` | auth, validated | `FriendController.getFriendDetail` |
| PUT | `/friends/:id` | auth, validated | `FriendController.updateFriend` |
| DELETE | `/friends/:id` | auth, validated | `FriendController.deleteFriend` |

## Files

- `friend.controller.ts`
- `friend.routes.ts`
- `friend.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `friends/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
