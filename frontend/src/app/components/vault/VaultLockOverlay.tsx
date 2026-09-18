import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldCheck, Delete, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { vaultService } from '@/services/vaultService';

interface VaultLockOverlayProps {
  onUnlocked: () => void;
}

export const VaultLockOverlay: React.FC<VaultLockOverlayProps> = ({ onUnlocked }) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        // Auto-verify on 4 digits or allow manual enter
        verifyPin(next);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const verifyPin = async (pinToVerify = pin) => {
    if (!pinToVerify || pinToVerify.length < 4) {
      toast.error('Please enter at least 4 digits');
      return;
    }

    setIsVerifying(true);
    setIsError(false);
    try {
      await vaultService.verifyLock(pinToVerify);
      toast.success('Vault unlocked');
      onUnlocked();
    } catch (err: any) {
      setIsError(true);
      toast.error(err?.response?.data?.error || err.message || 'Incorrect Vault PIN');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 mb-4">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Kanakku Vault Locked</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
          Your documents are private and encrypted. Enter your Vault PIN to continue.
        </p>

        {/* PIN indicator dots */}
        <motion.div
          animate={isError ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3 my-6"
        >
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                pin.length > idx
                  ? 'bg-amber-500 scale-110 shadow-sm shadow-amber-500/50'
                  : 'border-2 border-slate-300 dark:border-slate-700 bg-transparent'
              }`}
            />
          ))}
        </motion.div>

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px] mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              disabled={isVerifying}
              className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-xl font-semibold text-slate-800 dark:text-white transition-all flex items-center justify-center"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isVerifying || pin.length === 0}
            className="h-14 rounded-2xl bg-slate-100/60 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 active:scale-95 transition-all flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            disabled={isVerifying}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-xl font-semibold text-slate-800 dark:text-white transition-all flex items-center justify-center"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => verifyPin()}
            disabled={isVerifying || pin.length < 4}
            className="h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold transition-all flex items-center justify-center disabled:opacity-40"
          >
            {isVerifying ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowRight className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Private by default • Protected by Kanakku Security</span>
        </div>
      </motion.div>
    </div>
  );
};
