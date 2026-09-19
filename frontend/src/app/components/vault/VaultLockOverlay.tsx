import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderLock, ShieldCheck, Delete } from 'lucide-react';
import { toast } from 'sonner';
import { vaultService } from '@/services/vaultService';

interface VaultLockOverlayProps {
  onUnlocked: () => void;
}

const PIN_LENGTH = 6;

export const VaultLockOverlay: React.FC<VaultLockOverlayProps> = ({ onUnlocked }) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length >= 12) return;
    const newPin = pin + digit;
    setPin(newPin);
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleVerify = async () => {
    if (pin.length < 4) {
      toast.error('PIN must be at least 4 digits');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await vaultService.verifyLock(pin);
      if (result.verified) {
        toast.success('Vault unlocked');
        onUnlocked();
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        toast.error('Incorrect PIN');
        setPin('');
      }
    } catch (err: any) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      toast.error(err.message || 'Verification failed');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleVerify();
    }
  }, [pin]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F8F9FD]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center w-full max-w-xs px-4"
      >
        {/* Brand Icon */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20 mb-6">
          <FolderLock className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-section-title text-center mb-1">Kanaku Vault</h2>
        <p className="text-body-sm text-slate-500 text-center mb-8">
          Enter your PIN to unlock
        </p>

        {/* PIN Dots */}
        <motion.div
          className="flex items-center gap-3 mb-8"
          animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                i < pin.length
                  ? 'bg-purple-600 scale-110 shadow-md shadow-purple-500/30'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </motion.div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          {digits.map((d, i) => {
            if (d === '') {
              return <div key={i} />;
            }
            if (d === 'del') {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={handleDelete}
                  disabled={isVerifying}
                  className="h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleDigit(d)}
                disabled={isVerifying}
                className="h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-900 hover:bg-slate-50 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Manual Submit (for PINs > 6 digits) */}
        {pin.length >= 4 && pin.length !== PIN_LENGTH && (
          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying}
            className="KANAKU-btn KANAKU-btn-primary w-full max-w-[260px] mt-4 disabled:opacity-50"
          >
            {isVerifying ? 'Verifying...' : 'Unlock Vault'}
          </button>
        )}

        {/* Security Badge */}
        <div className="flex items-center gap-1.5 mt-8">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-caption text-emerald-600">
            AES-256 encrypted · Your data never leaves your control
          </span>
        </div>
      </motion.div>
    </div>
  );
};
