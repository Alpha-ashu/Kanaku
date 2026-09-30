/**
 * Typed failures of wallet operations. Each carries the HTTP status and a
 * stable code the client can branch on, and a message safe to show the user —
 * internal detail stays in the server log.
 */
export type WalletErrorCode =
  | 'INSUFFICIENT_COINS'
  | 'WALLET_FROZEN'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_NOT_PAYABLE'
  | 'PAYMENT_WINDOW_CLOSED'
  | 'ALREADY_PAID'
  | 'NOT_REFUNDABLE'
  | 'ADVISOR_BALANCE_INSUFFICIENT'
  | 'PACKAGE_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_PAYABLE'
  | 'PAYMENT_NOT_CONFIRMED'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'PAYMENT_ID_REUSED'
  | 'INVALID_ADJUSTMENT'
  | 'SESSION_LOCKED';

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export const isWalletError = (error: unknown): error is WalletError => error instanceof WalletError;
