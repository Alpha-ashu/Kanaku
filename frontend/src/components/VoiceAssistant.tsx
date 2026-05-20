import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Trash2, Plus } from 'lucide-react';
import { useVoiceAssistant } from '@/hooks/useVoiceAssistant';
import { voiceTransactionService } from '@/services/voiceTransactionService';
import type { ParsedTransaction, ParsedGroupExpense } from '@/services/voiceCommandParser';

interface VoiceAssistantProps {
  accountId?: number;
  userId?: string;
  onTransactionCreated?: () => void;
  onClose?: () => void;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
  accountId,
  userId,
  onTransactionCreated,
  onClose,
}) => {
  const {
    isListening,
    interimText,
    finalText,
    error,
    parsedCommand,
    confidence,
    startListening,
    stopListening,
    clearText,
    continueListening,
    isSupported,
  } = useVoiceAssistant();

  const [isProcessing, setIsProcessing] = useState(false);

  if (!isSupported) {
    return (
      <Card className="p-4 border-yellow-200 bg-yellow-50">
        <p className="text-sm text-yellow-800">
          Voice assistant is not supported on your browser. Please use Chrome, Edge, or Safari.
        </p>
      </Card>
    );
  }

  const handleCreateTransactions = useCallback(async () => {
    if (!parsedCommand?.transactions || parsedCommand.transactions.length === 0) {
      return;
    }

    setIsProcessing(true);
    const loadingToast = toast.loading('Creating transactions...');

    try {
      await voiceTransactionService.createTransactionsFromVoice(
        parsedCommand.transactions,
        accountId,
        userId,
      );

      toast.dismiss(loadingToast);
      toast.success(`Created ${parsedCommand.transactions.length} transaction(s)`);
      onTransactionCreated?.();
      clearText();
    } catch (err) {
      toast.dismiss(loadingToast);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create transactions';
      toast.error(errorMsg);
      console.error('Failed to create transactions:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [parsedCommand, accountId, userId, onTransactionCreated, clearText]);

  const handleCreateGroupExpense = useCallback(async () => {
    if (!parsedCommand?.groupExpenses || parsedCommand.groupExpenses.length === 0) {
      return;
    }

    setIsProcessing(true);
    const loadingToast = toast.loading('Creating group expense...');

    try {
      for (const expense of parsedCommand.groupExpenses) {
        await voiceTransactionService.createGroupExpenseFromVoice(expense, userId);
      }

      toast.dismiss(loadingToast);
      toast.success('Group expense created with participants');
      onTransactionCreated?.();
      clearText();
    } catch (err) {
      toast.dismiss(loadingToast);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create group expense';
      toast.error(errorMsg);
      console.error('Failed to create group expense:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [parsedCommand, userId, onTransactionCreated, clearText]);

  return (
    <div className="w-full space-y-4">
      {/* Microphone Control */}
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button
            onClick={isListening ? stopListening : startListening}
            variant={isListening ? 'destructive' : 'default'}
            size="lg"
            className="rounded-full w-14 h-14 p-0"
          >
            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {isListening ? 'Listening...' : 'Click to start voice input'}
            </p>
            {confidence > 0 && <p className="text-xs text-gray-500">Confidence: {Math.round(confidence * 100)}%</p>}
          </div>
        </div>

        {/* Interim Text (live preview) */}
        {interimText && (
          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 italic">
            {interimText}...
          </div>
        )}

        {/* Final Text */}
        {finalText && (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-900 font-medium">
            {finalText}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-900">
            {error}
          </div>
        )}

        {/* Control Buttons */}
        {finalText && (
          <div className="flex gap-2">
            <Button
              onClick={continueListening}
              variant="outline"
              size="sm"
              disabled={isListening || isProcessing}
            >
              Continue
            </Button>
            <Button
              onClick={clearText}
              variant="outline"
              size="sm"
              disabled={isProcessing}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </Card>

      {/* Parsed Transactions Display */}
      {parsedCommand?.transactions && parsedCommand.transactions.length > 0 && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Transactions to Create ({parsedCommand.transactions.length})
          </h3>
          <div className="space-y-2 mb-4">
            {parsedCommand.transactions.map((tx, idx) => (
              <div
                key={idx}
                className="p-2 bg-white border border-blue-100 rounded flex justify-between items-center"
              >
                <div>
                  <p className="font-medium text-sm">{tx.description}</p>
                  <p className="text-xs text-gray-600">Category: {tx.category}</p>
                </div>
                <p className="font-semibold">₹{tx.amount.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <Button
            onClick={handleCreateTransactions}
            variant="default"
            className="w-full"
            disabled={isProcessing}
          >
            {isProcessing ? 'Creating...' : 'Create Transactions'}
          </Button>
        </Card>
      )}

      {/* Parsed Group Expense Display */}
      {parsedCommand?.groupExpenses && parsedCommand.groupExpenses.length > 0 && (
        <Card className="p-4 bg-purple-50 border-purple-200">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Group Expense to Create
          </h3>
          {parsedCommand.groupExpenses.map((expense, idx) => (
            <div key={idx} className="mb-4 p-3 bg-white border border-purple-100 rounded">
              <p className="font-medium text-sm mb-2">{expense.description}</p>
              {expense.location && <p className="text-xs text-gray-600 mb-2">Location: {expense.location}</p>}
              <p className="text-xs text-gray-600 mb-3">
                Friends: {expense.friends.join(', ')}
              </p>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm">Total Amount:</span>
                <span className="font-semibold">₹{expense.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-600">
                <span>Per person (equal split):</span>
                <span className="font-medium">
                  ₹{(expense.totalAmount / Math.max(1, expense.friends.length)).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
          <Button
            onClick={handleCreateGroupExpense}
            variant="default"
            className="w-full bg-purple-600 hover:bg-purple-700"
            disabled={isProcessing}
          >
            {isProcessing ? 'Creating...' : 'Create Group Expense'}
          </Button>
        </Card>
      )}

      {/* Help Text */}
      {!finalText && !interimText && (
        <Card className="p-3 bg-gray-50 border-gray-200">
          <p className="text-xs text-gray-600 mb-2">
            <strong>Try saying:</strong>
          </p>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• "I spend on dinner 3456"</li>
            <li>• "I petrol my car 2239 and recharge my mobile 1223"</li>
            <li>• "Start group trip to bali with jijo and arun and preethi and amala for 50000"</li>
          </ul>
        </Card>
      )}
    </div>
  );
};

export default VoiceAssistant;
