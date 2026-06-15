import React from 'react';
// import { getCountryAndCurrencySymbol } from '@/lib/countryCurrency';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/app/components/ui/tooltip';
import { NavigationItem } from '@/app/constants/navigation';
import { useSharedMenu } from '@/hooks/useSharedMenu';
import { GripVertical } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';

interface DraggableSidebarItemProps {
 item: NavigationItem;
 isActive: boolean;
 onNavigate: (id: string) => void;
}

const DraggableSidebarItem: React.FC<DraggableSidebarItemProps> = ({
 item,
 isActive,
 onNavigate,
}) => {
 const Icon = item.icon;
 const dragControls = useDragControls();

 return (
 <Reorder.Item
 value={item}
 dragListener={false}
 dragControls={dragControls}
 className="relative"
 whileDrag={{ scale: 1.1, zIndex: 50 }}
 transition={{ type:"spring", stiffness: 300, damping: 25 }}
 >
 <Tooltip>
 <TooltipTrigger asChild>
 <motion.div
 role="button"
 aria-label={item.label}
 data-nav-id={item.id}
 data-testid={`nav-${item.id}-button`}
 className={cn(
 "w-10 h-10 flex items-center justify-center rounded-xl transition-all relative group cursor-pointer",
 isActive
 ?"bg-black text-white shadow-md shadow-slate-900/10"
 :"text-slate-400 hover:bg-slate-50 hover:text-slate-900"
 )}
 whileHover={{ scale: 1.05 }}
 whileTap={{ scale: 0.95 }}
 onClick={() => onNavigate(item.id)}
 >
 {isActive && (
 <motion.div
 layoutId="activeTab"
 className="absolute inset-0 bg-black rounded-xl z-0"
 transition={{ type:"spring", stiffness: 300, damping: 30 }}
 />
 )}
 <Icon size={20} className="relative z-10" />

 {/* Drag handle - visible on hover */}
 <motion.div
 className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
 onPointerDown={(e) => dragControls.start(e)}
 >
 <GripVertical size={10} className="text-slate-300" />
 </motion.div>
 </motion.div>
 </TooltipTrigger>
 <TooltipContent side="right" className="font-semibold bg-slate-900 text-white border-none ml-2 px-3 py-1.5 text-xs rounded-xl shadow-md">
 {item.label}
 </TooltipContent>
 </Tooltip>
 </Reorder.Item>
 );
};

export const Sidebar: React.FC = () => {
 const { orderedItems, handleReorder, handleNavigate, currentPage } = useSharedMenu();

 return (
 <motion.div
 initial={{ x: -100, opacity: 0 }}
 animate={{ x: 0, opacity: 1 }}
 className="py-4 pl-4 pr-2 flex flex-col z-50 fixed h-fit top-0 left-0 bottom-0 m-auto"
 >
 <div className="bg-white/85 backdrop-blur-2xl border border-slate-100 shadow-lg rounded-[24px] flex flex-col items-center py-4 w-20 max-h-[92vh]">
 <div className="mb-4">
 <KANAKULogo className="w-10 h-10 drop-shadow-sm" />
 </div>

 <nav className="w-full px-2 flex flex-col items-center flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-2">
 <TooltipProvider delayDuration={0}>
 <Reorder.Group
 axis="y"
 values={orderedItems}
 onReorder={handleReorder}
 className="space-y-2 flex flex-col items-center"
 >
 {orderedItems.map((item) => (
 <DraggableSidebarItem
 key={item.id}
 item={item}
 isActive={currentPage === item.id}
 onNavigate={handleNavigate}
 />
 ))}
 </Reorder.Group>
 </TooltipProvider>
 </nav>
 </div>
 </motion.div>
 );
};


