import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';

export const ReceiptScannerPage: React.FC = () => {
  const { setCurrentPage } = useApp();

  const handleApplyScan = (scan: any) => {
    localStorage.setItem('pendingReceiptScan', JSON.stringify(scan));
    setCurrentPage('add-transaction');
  };

  return (
    <CenteredLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <ReceiptScanner
          isOpen={true}
          onClose={() => setCurrentPage('transactions')}
          onApplyScan={handleApplyScan}
        />
      </div>
    </CenteredLayout>
  );
};

export default ReceiptScannerPage;
