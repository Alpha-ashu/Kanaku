import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { WALLET_CHANGED_EVENT, formatCoinsCompact, walletService } from '@/services/walletService';
import { CoinMark } from './CoinMark';

/**
 * The coin balance in the top bar. Opens the wallet.
 *
 * Rendered only when the `wallet` module is visible to the role (the admin
 * toggle decides). The number is the server's: fetched on mount, after any
 * purchase or withdrawal (WALLET_CHANGED_EVENT), and when the app comes back
 * to the foreground — never more than once a minute for the last one. If the
 * balance cannot be read (offline, PIN locked) the chip still opens the wallet,
 * just without a number.
 */

const FOREGROUND_REFRESH_MS = 60_000;

interface WalletChipProps {
  onOpen: () => void;
  active?: boolean;
}

export const WalletChip: React.FC<WalletChipProps> = ({ onOpen, active = false }) => {
  const [balance, setBalance] = useState<number | null>(null);
  const lastFetch = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const wallet = await walletService.getWallet();
      if (mounted.current) setBalance(wallet.availableBalance);
    } catch {
      // Keep the last known balance; the wallet page shows the real error.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onChanged = () => { void refresh(); };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > FOREGROUND_REFRESH_MS) void refresh();
    };
    window.addEventListener(WALLET_CHANGED_EVENT, onChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      window.removeEventListener(WALLET_CHANGED_EVENT, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const label = balance === null ? 'Wallet' : `Wallet: ${balance.toLocaleString('en-IN')} coins`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      data-testid="top-bar-wallet"
      className={cn(
        'h-9 sm:h-10 shrink-0 flex items-center gap-1.5 rounded-full border bg-white shadow-xs transition-all cursor-pointer active:scale-95',
        'w-9 justify-center sm:w-auto sm:justify-start sm:pl-1 sm:pr-3',
        active ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-200/80 hover:bg-slate-50',
      )}
    >
      <CoinMark size="sm" />
      <span className="hidden sm:inline text-sm font-bold text-slate-900 tabular-nums" data-testid="top-bar-wallet-balance">
        {balance === null ? '—' : formatCoinsCompact(balance)}
      </span>
    </button>
  );
};
