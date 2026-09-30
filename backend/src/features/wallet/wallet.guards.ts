import { prisma } from '../../db/prisma';

/**
 * Why an account cannot be deleted yet, in words for the person deleting it.
 *
 * Deleting a user cascades to their bookings. A paid session that has not
 * happened would take the client's coins (and the advisor's pending earning)
 * with it, and a balance still on the wallet would simply vanish. The ledger
 * itself survives deletion (it has no foreign key to User), but the money it
 * describes must be settled first: spent, refunded, or zeroed by an audited
 * admin adjustment.
 */
export const financialDeletionBlockers = async (userId: string): Promise<string[]> => {
  const [wallet, openPaid] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { availableBalance: true, pendingBalance: true } }),
    prisma.bookingRequest.count({
      where: { OR: [{ clientId: userId }, { advisorId: userId }], status: 'accepted', paymentStatus: 'PAID' },
    }),
  ]);
  const blockers: string[] = [];
  if (wallet && wallet.availableBalance > 0) blockers.push(`the wallet still holds ${wallet.availableBalance} coins`);
  if (wallet && wallet.pendingBalance > 0) blockers.push(`${wallet.pendingBalance} coins of session earnings are still pending`);
  if (openPaid > 0) blockers.push(`${openPaid} paid session(s) have not taken place yet`);
  return blockers;
};
