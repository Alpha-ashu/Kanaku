import React, { useState } from 'react';
import VoiceAssistant from '@/components/VoiceAssistant';
import { X } from 'lucide-react';

// Local shims — shadcn/ui is not installed in this project
const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`rounded-lg border bg-white shadow-sm ${className}`}>{children}</div>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }> = ({
  variant, size, className = '', children, ...rest
}) => (
  <button data-testid="voice-assistant-page-button" className={`inline-flex items-center justify-center font-medium transition-colors rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100 text-slate-900 ${className}`} {...rest}>{children}</button>
);

/**
 * Example page showing how to integrate the Voice Assistant component
 * This can be added as a modal or dialog in your main expense tracking page
 */
export const VoiceAssistantPage: React.FC<{
  accountId?: number;
  userId?: string;
  onClose?: () => void;
  onTransactionsCreated?: () => void;
}> = ({ accountId, userId, onClose, onTransactionsCreated }) => {
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card data-testid="voice-assistant-page-card" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Voice Assistant</h2>
          <Button data-testid="voice-assistant-page-button-2"
            variant="ghost"
            size="sm"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6">
          <VoiceAssistant
            accountId={accountId}
            userId={userId}
            onTransactionCreated={() => {
              onTransactionsCreated?.();
            }}
            onClose={handleClose}
          />
        </div>
      </Card>
    </div>
  );
};

/**
 * Usage in your main page:
 *
 * const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
 *
 * return (
 *   <>
 *     <Button onClick={() => setShowVoiceAssistant(true)}>
 *       <Mic className="w-4 h-4" /> Voice Input
 *     </Button>
 *
 *     {showVoiceAssistant && (
 *       <VoiceAssistantPage
 *         accountId={accountId}
 *         userId={userId}
 *         onClose={() => setShowVoiceAssistant(false)}
 *         onTransactionsCreated={() => {
 *           // Refresh transactions list
 *           refetchTransactions();
 *         }}
 *       />
 *     )}
 *   </>
 * );
 */
