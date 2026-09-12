import React from 'react';

/**
 * @deprecated QuickActionModal has been removed in favor of the unified BottomNav quick action popup.
 */
export const QuickActionModal: React.FC<{
  isOpen?: boolean;
  onClose?: () => void;
  onAction?: (action: string) => void;
}> = () => null;

export default QuickActionModal;

