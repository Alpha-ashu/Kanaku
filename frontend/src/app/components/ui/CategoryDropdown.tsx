import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { getCategoryCartoonIcon } from './CartoonCategoryIcons';
import { cn } from '@/lib/utils';

interface CategoryDropdownProps {
 value: string;
 onChange: (value: string) => void;
 options: string[];
 placeholder?: string;
 label?: string;
 required?: boolean;
 className?: string;
}

export const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
 value,
 onChange,
 options,
 placeholder = 'Select a category',
 label,
 required = false,
 className = '',
}) => {
 const [isOpen, setIsOpen] = useState(false);
 const dropdownRef = useRef<HTMLDivElement>(null);

 // Close dropdown when clicking outside
 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 };

 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 // Close on escape key
 useEffect(() => {
 const handleEscape = (event: KeyboardEvent) => {
 if (event.key === 'Escape') setIsOpen(false);
 };

 document.addEventListener('keydown', handleEscape);
 return () => document.removeEventListener('keydown', handleEscape);
 }, []);

 const selectedOption = options.find(opt => opt === value);

 return (
 <div className={cn('relative', className)} ref={dropdownRef}>
 {label && (
 <label className="block text-sm font-semibold text-gray-900 mb-3">
 {label} {required && '*'}
 </label>
 )}
 
 {/* Trigger Button */}
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 className={cn(
 'w-full flex items-center gap-3 p-5 bg-white border border-slate-100 rounded-2xl shadow-sm',
 'hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
 'transition-all duration-200',
 isOpen && 'ring-2 ring-blue-500 border-transparent'
 )}
 >
 {selectedOption ? (
 <>
 <div className="flex-shrink-0">
 {getCategoryCartoonIcon(selectedOption, 36)}
 </div>
 <span className="min-w-0 flex-1 truncate text-left font-medium text-gray-900">{selectedOption}</span>
 </>
 ) : (
 <span className="min-w-0 flex-1 truncate text-left text-gray-500">{placeholder}</span>
 )}
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 shadow-sm">
 <ChevronDown 
 className={cn(
 'w-5 h-5 transition-transform duration-200',
 isOpen && 'rotate-180'
 )} 
 />
 </span>
 </button>

 {/* Dropdown Menu */}
 <AnimatePresence>
 {isOpen && (
 <motion.div
 initial={{ opacity: 0, y: -10, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -10, scale: 0.95 }}
 transition={{ duration: 0.15, ease: 'easeOut' }}
 className="absolute z-50 w-full mt-2 max-h-80 overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col"
 >
 <div className="py-2 divide-y divide-slate-50">
 {options.map((option, index) => {
 const isSelected = option === value;
 
 return (
 <motion.button
 key={option}
 type="button"
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: index * 0.02 }}
 onClick={() => {
 onChange(option);
 setIsOpen(false);
 }}
 className={cn(
 'w-full flex items-center gap-4 px-5 py-4 transition-all duration-200',
 'hover:bg-slate-50 active:scale-[0.98]',
 isSelected && 'bg-blue-50/50'
 )}
 >
 <div className="flex-shrink-0 transform transition-transform group-hover:scale-110">
 {getCategoryCartoonIcon(option, 44)}
 </div>
 <div className="flex-1 text-left">
 <span className={cn(
 'font-bold text-sm tracking-tight',
 isSelected ? 'text-blue-600' : 'text-slate-700'
 )}>
 {option}
 </span>
 </div>
 {isSelected && (
 <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-500">
 <Check className="w-4 h-4 text-white" />
 </div>
 )}
 </motion.button>
 );
 })}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
};
