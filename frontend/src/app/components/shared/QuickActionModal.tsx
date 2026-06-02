import React, { useState } from 'react';
import {
 X,
 TrendingDown,
 TrendingUp,
 ArrowRightLeft,
 Users,
 Target,
 Mic,
 Calendar,
 CreditCard,
 Wallet,
 CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/button';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { useAICapability } from '@/contexts/AppContext';

interface QuickActionModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAction: (action: string) => void;
}

const quickActions = [
 { id: 'add-expense', label: 'Expense', icon: 'Food & Dining', gradient: 'from-pink-500 to-rose-500', description: 'Quick expense entry', openForm: 'expense' },
 { id: 'add-income', label: 'Income', icon: 'Salary', gradient: 'from-emerald-400 to-teal-500', description: 'Record income', openForm: 'income' },
 { id: 'add-account', label: 'Account', icon: 'Savings', gradient: 'from-indigo-500 to-purple-600', description: 'New account', openForm: 'account' },
 { id: 'transfer', label: 'Transfer', icon: 'transfer', gradient: 'from-blue-500 to-indigo-600', description: 'Transfer money', openForm: 'transfer' },
 { id: 'split-bill', label: 'Split', icon: 'Family & Kids', gradient: 'from-violet-500 to-purple-600', description: 'Group expense', openForm: 'group' },
 { id: 'add-goal', label: 'New Goal', icon: 'goal', gradient: 'from-amber-400 to-orange-500', description: 'Savings goal', openForm: 'goal' },
 { id: 'todo-lists', label: 'Todo', icon: 'Tasks', gradient: 'from-green-500 to-emerald-600', description: 'Task list', openForm: 'todos' },
 { id: 'calendar', label: 'Calendar', icon: 'calendar', gradient: 'from-cyan-400 to-blue-500', description: 'Transaction calendar', openForm: 'calendar' },
 { id: 'voice-entry', label: 'Voice', icon: 'voice', gradient: 'from-fuchsia-500 to-pink-600', description: 'Speak to add', openForm: 'voice' },
];

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
 isOpen,
 onClose,
 onAction,
}) => {
 const [selectedAction, setSelectedAction] = useState<string | null>(null);
 const voiceEnabled = useAICapability('voiceAssistant');

 const filteredActions = quickActions.filter(action => {
   if (action.id === 'voice-entry') return voiceEnabled;
   return true;
 });

 const handleAction = async (actionId: string) => {
 if (Capacitor.isNativePlatform()) {
 try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
 }
 setSelectedAction(actionId);
 setTimeout(() => {
 onAction(actionId);
 onClose();
 setSelectedAction(null);
 }, 150);
 };

 return (
 <AnimatePresence>
 {isOpen && (
 <>
 {/* Backdrop */}
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60]"
 onClick={onClose}
 />

 {/* Bottom Sheet */}
 <motion.div
 initial={{ y: '100%', opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: '100%', opacity: 0 }}
 transition={{ type: 'spring', damping: 28, stiffness: 320 }}
 className="fixed inset-x-0 bottom-0 z-[61] bg-white/95 backdrop-blur-2xl rounded-t-[32px] shadow-2xl border-t border-white/50 overflow-visible"
 >
 {/* Drag Handle */}
 <div className="flex justify-center pt-3 pb-1">
 <div className="w-10 h-1 bg-gray-300/60 rounded-full" />
 </div>

 {/* Header */}
 <div className="flex items-center justify-between px-5 pt-3 pb-4">
 <div>
 <h3 className="text-xl font-bold text-gray-900 leading-tight">Quick Actions</h3>
 <p className="text-xs text-gray-400 font-medium mt-0.5">What would you like to do?</p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 onClick={onClose}
 className="rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 w-9 h-9"
 aria-label="Close quick actions"
 title="Close quick actions"
 >
 <X size={18} />
 </Button>
 </div>

 {/* 4-col 2-row grid - NO scroll, all 8 fit */}
 <div className="px-4 pb-36 overflow-visible">
 <div className="grid grid-cols-4 gap-3">
 {filteredActions.map((action, i) => {
 const Icon = action.icon;
 const isSelected = selectedAction === action.id;

 return (
 <motion.button
 key={action.id}
 onClick={() => handleAction(action.id)}
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: i * 0.03, type: 'spring', stiffness: 300, damping: 22 }}
 whileTap={{ scale: 0.93 }}
 whileHover={{ scale: 1.04 }}
 className={cn(
"flex flex-col items-center gap-2.5 py-4 px-2 rounded-2xl border transition-all",
 isSelected
 ?"bg-white border-gray-200 ring-2 ring-black/10"
 :"bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50 shadow-sm hover:shadow-md"
 )}
 >
 {/* Icon bubble */}
 <div className="w-12 h-12 flex items-center justify-center">
 {getCategoryCartoonIcon(action.icon, 40)}
 </div>

 {/* Label */}
 <span className="text-[11.5px] font-semibold text-gray-800 text-center leading-tight w-full truncate px-1">
 {action.label}
 </span>

 {/* Subtle description - only shown on slightly larger screens */}
 <span className="hidden sm:block text-[10px] text-gray-400 text-center leading-tight truncate w-full px-1">
 {action.description}
 </span>
 </motion.button>
 );
 })}
 </div>
 </div>

 {/* iOS safe-area spacer */}
 <div className="h-safe-bottom bg-white/95" />
 </motion.div>
 </>
 )}
 </AnimatePresence>
 );
};
