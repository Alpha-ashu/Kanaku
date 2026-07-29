import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trash2, ShieldAlert, Mail, CheckCircle2, UserX } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface DataDeletionProps {
  onBack?: () => void;
  onGetStarted?: () => void;
  onNavigate?: (page: string) => void;
  onLogin?: () => void;
  hideNavbar?: boolean;
}

export const DataDeletion: React.FC<DataDeletionProps> = ({
  onGetStarted = () => {},
  onNavigate = () => {},
  onLogin = () => {},
  hideNavbar = false,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const steps = [
    {
      title: '1. In-App Account Deletion',
      icon: <Trash2 className="w-5 h-5 text-red-500" />,
      content:
        'Log in to Kanaku, open your Profile Settings, scroll to the bottom, and click "Delete Account". All your synced data, accounts, transactions, and cloud backups will be purged immediately.',
    },
    {
      title: '2. Email Request',
      icon: <Mail className="w-5 h-5 text-blue-500" />,
      content:
        'If you cannot log in, send an email to shaik.job.details@gmail.com with the subject "Account & Data Deletion Request" from your registered email address. Our team will verify and execute the deletion within 48 hours.',
    },
    {
      title: '3. Data Purged',
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      content:
        'All associated personal identifiable information (PII), database records, local caches, and analytical identifiers are permanently destroyed.',
    },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 select-none pb-20">
      {!hideNavbar && (
        <PublicNavbar
          onNavigate={onNavigate}
          onLogin={onLogin}
          onGetStarted={onGetStarted}
          currentPage="data-deletion"
        />
      )}

      <div className="max-w-4xl mx-auto px-6 pt-40 lg:pt-52 pb-24">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 bg-red-50 px-4 py-2 rounded-full text-red-600 font-bold text-[10px] uppercase tracking-widest mb-6"
          >
            Data Rights & Removal
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4"
          >
            Account & Data Deletion Policy
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-500 max-w-xl mx-auto"
          >
            We respect your right to control your personal financial data. You can delete your account and all associated data at any time.
          </motion.p>
        </div>

        <div className="space-y-6">
          {steps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.05 }}
              className="p-8 bg-white/50 rounded-[2.5rem] border border-gray-100/50 hover:bg-white hover:shadow-xl hover:border-white transition-all group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                  {step.icon}
                </div>
                <h2 className="text-xl font-bold text-gray-900">{step.title}</h2>
              </div>
              <p className="text-gray-600 leading-relaxed pl-14">{step.content}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-16 p-10 bg-gray-900 rounded-[3rem] text-white text-center relative overflow-hidden"
        >
          <UserX className="w-10 h-10 mx-auto mb-6 text-red-400" />
          <h3 className="text-2xl font-bold mb-4">Immediate Permanent Erasure</h3>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Once deleted, your transaction history, account details, and AI intelligence profile cannot be restored.
          </p>
          <div className="flex items-center justify-center gap-4">
            <div className="px-4 py-2 rounded-xl border border-gray-800 text-xs font-bold text-gray-500 uppercase tracking-widest">
              Zero Residual Retention
            </div>
            <div className="px-4 py-2 rounded-xl border border-gray-800 text-xs font-bold text-gray-500 uppercase tracking-widest">
              GDPR & CCPA Compliant
            </div>
          </div>
        </motion.div>
      </div>

      <footer className="py-10 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} KANAKU. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
