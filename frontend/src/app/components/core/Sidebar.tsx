import React from 'react';
// import { getCountryAndCurrencySymbol } from '@/lib/countryCurrency';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/app/components/ui/tooltip';
import { NavigationItem } from '@/app/constants/navigation';
import { useSharedMenu } from '@/hooks/useSharedMenu';
import { GripVertical } from 'lucide-react';
import { KANKULogo } from '@/app/components/ui/KANKULogo';

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
 className={cn(
"w-12 h-12 flex items-center justify-center rounded-2xl transition-all relative group cursor-pointer",
 isActive
 ?"bg-black text-white shadow-lg"
 :"text-gray-400 hover:bg-gray-100 hover:text-gray-900"
 )}
 whileHover={{ scale: 1.05 }}
 whileTap={{ scale: 0.95 }}
 onClick={() => onNavigate(item.id)}
 >
 {isActive && (
 <motion.div
 layoutId="activeTab"
 className="absolute inset-0 bg-black rounded-2xl z-0"
 transition={{ type:"spring", stiffness: 300, damping: 30 }}
 />
 )}
 <Icon size={24} className="relative z-10" />

 {/* Drag handle - visible on hover */}
 <motion.div
 className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
 onPointerDown={(e) => dragControls.start(e)}
 >
 <GripVertical size={12} className="text-gray-400" />
 </motion.div>
 </motion.div>
 </TooltipTrigger>
 <TooltipContent side="right" className="font-medium bg-black text-white border-none ml-2">
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
 className="py-6 pl-4 pr-2 flex flex-col z-50 fixed h-fit top-0 left-0 bottom-0 m-auto"
 >
 <div className="bg-white/80 backdrop-blur-xl border border-white/20 shadow-floating rounded-[30px] flex flex-col items-center py-6 w-24 max-h-[90vh]">
 <div className="mb-8">
 <KANKULogo className="w-12 h-12 drop-shadow-md" />
 </div>

 <nav className="w-full px-4 flex flex-col items-center flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-4">
 <TooltipProvider delayDuration={0}>
 <Reorder.Group
 axis="y"
 values={orderedItems}
 onReorder={handleReorder}
 className="space-y-4 flex flex-col items-center"
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


