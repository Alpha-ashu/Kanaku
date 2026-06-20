import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption {
 value: string;
 label: string;
 icon?: React.ReactNode;
 description?: string;
 group?: string;
}

interface SearchableDropdownProps {
 options: DropdownOption[];
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
 searchPlaceholder?: string;
 label?: string;
 error?: string;
 required?: boolean;
 disabled?: boolean;
 className?: string;
 id?: string;
 grouped?: boolean;
 renderTrigger?: (selected: DropdownOption | undefined, open: boolean) => React.ReactNode;
 triggerClassName?: string;
 allowCustom?: boolean;
 testId?: string;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
 options,
 value,
 onChange,
 placeholder = 'Select an option',
 searchPlaceholder = 'Search...',
 label,
 error,
 required,
 disabled,
 className,
 id,
 grouped = false,
 renderTrigger,
 triggerClassName,
 allowCustom = false,
 testId,
}) => {
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState('');
 const [highlighted, setHighlighted] = useState(0);
 const containerRef = useRef<HTMLDivElement>(null);
 const searchRef = useRef<HTMLInputElement>(null);
 const listRef = useRef<HTMLDivElement>(null);
 const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

 const selected = options.find((o) => o.value === value);
 const filtered = query.trim()
 ? options.filter(
 (o) =>
 o.label.toLowerCase().includes(query.toLowerCase()) ||
 o.description?.toLowerCase().includes(query.toLowerCase()) ||
 o.group?.toLowerCase().includes(query.toLowerCase()),
 )
 : options;

 const groupedOptions = grouped
 ? filtered.reduce<Record<string, DropdownOption[]>>((acc, opt) => {
 const group = opt.group ?? 'Other';
 if (!acc[group]) acc[group] = [];
 acc[group].push(opt);
 return acc;
 }, {})
 : { '': filtered };

 const flatFiltered = filtered;

 const updateCoords = useCallback(() => {
 if (containerRef.current) {
 const rect = containerRef.current.getBoundingClientRect();
 setCoords({
 top: rect.bottom,
 left: rect.left,
 width: rect.width,
 });
 }
 }, []);

 const openDropdown = useCallback(() => {
 if (disabled) return;
 updateCoords();
 setOpen(true);
 setQuery('');
 setHighlighted(0);
 setTimeout(() => searchRef.current?.focus(), 50);
 }, [disabled, updateCoords]);

 const closeDropdown = useCallback(() => {
 setOpen(false);
 setQuery('');
 }, []);

 const selectOption = useCallback(
 (opt: DropdownOption) => {
 onChange(opt.value);
 closeDropdown();
 },
 [onChange, closeDropdown],
 );

 useEffect(() => {
 if (open) {
 window.addEventListener('resize', updateCoords);
 window.addEventListener('scroll', updateCoords, true);
 }
 return () => {
 window.removeEventListener('resize', updateCoords);
 window.removeEventListener('scroll', updateCoords, true);
 };
 }, [open, updateCoords]);

 useEffect(() => {
 const handler = (e: MouseEvent) => {
 if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
 // Also check if click is inside the portal
 const portal = document.getElementById('dropdown-portal-root');
 if (portal && portal.contains(e.target as Node)) return;
 closeDropdown();
 }
 };
 if (open) document.addEventListener('mousedown', handler);
 return () => document.removeEventListener('mousedown', handler);
 }, [open, closeDropdown]);

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (!open) {
 if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
 e.preventDefault();
 openDropdown();
 }
 return;
 }
 switch (e.key) {
 case 'ArrowDown':
 e.preventDefault();
 setHighlighted((h) => Math.min(h + 1, flatFiltered.length - 1));
 break;
 case 'ArrowUp':
 e.preventDefault();
 setHighlighted((h) => Math.max(h - 1, 0));
 break;
 case 'Enter':
 e.preventDefault();
 if (flatFiltered[highlighted]) selectOption(flatFiltered[highlighted]);
 break;
 case 'Escape':
 closeDropdown();
 break;
 }
 };

 useEffect(() => {
 if (!listRef.current) return;
 const items = listRef.current.querySelectorAll('[data-option]');
 items[highlighted]?.scrollIntoView({ block: 'nearest' });
 }, [highlighted, open]);

 const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : 'searchable-dropdown');

 return (
 <div ref={containerRef} className={cn('relative', className)}>
 {label && (
 <label htmlFor={inputId} className="block text-sm font-semibold text-gray-700 mb-1.5 leading-none">
 {label}
 {required && <span className="text-rose-500 ml-1">*</span>}
 </label>
 )}

 {renderTrigger ? (
 <div
 id={inputId}
 role="combobox"
 aria-expanded={open}
 aria-haspopup="listbox"
 tabIndex={disabled ? -1 : 0}
 onClick={openDropdown}
 onKeyDown={handleKeyDown}
 data-testid={testId}
 className={cn('cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}
 >
 {renderTrigger(selected, open)}
 </div>
 ) : (
 <button
 id={inputId}
 type="button"
 role="combobox"
 aria-expanded={open}
 aria-haspopup="listbox"
 disabled={disabled}
 onClick={openDropdown}
 onKeyDown={handleKeyDown}
 data-testid={testId}
 className={cn(
 'w-full flex items-center gap-2 rounded-2xl px-4 py-3 bg-white border border-slate-100 text-left transition-all shadow-sm min-h-[48px]',
 'focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400',
 open ? 'ring-2 ring-indigo-400/60 border-indigo-400' : error ? 'border-rose-400 bg-rose-50/50' : 'hover:border-slate-300',
 disabled && 'opacity-60 cursor-not-allowed',
 triggerClassName
 )}
 >
 {selected?.icon && <span className="shrink-0 text-base flex items-center justify-center">{selected.icon}</span>}
 <span className={cn('flex-1 text-sm font-bold truncate', selected ? 'text-gray-900' : 'text-gray-400')}>
 {selected?.label ?? placeholder}
 </span>
 <ChevronDown size={16} className={cn('shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
 </button>
 )}

 {error && !open && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}

 {open && createPortal(
 <div
 id="dropdown-portal-root"
 className="fixed z-[9999] bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
 style={{ 
 top: coords.top + 8, 
 left: coords.left, 
 width: coords.width,
 maxHeight: '320px' 
 }}
 >
 <div className="p-2 border-b border-gray-100 sticky top-0 bg-white z-10">
 <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
 <Search size={14} className="text-gray-400 shrink-0" />
 <input
 ref={searchRef}
 type="text"
 value={query}
 onChange={(e) => {
 setQuery(e.target.value);
 setHighlighted(0);
 }}
 onKeyDown={handleKeyDown}
 placeholder={searchPlaceholder}
 data-testid={testId ? `${testId}-search-input` : undefined}
 className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
 />
 {query && (
 <button data-testid="searchable-dropdown-button" type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
 <X size={12} />
 </button>
 )}
 </div>
 </div>

 <div data-testid="searchable-dropdown-div" ref={listRef} className="overflow-y-auto" style={{ maxHeight: '256px' }} role="listbox">
 {allowCustom && query.trim() && !flatFiltered.some(o => o.label.toLowerCase() === query.toLowerCase()) && (
 <button data-testid="searchable-dropdown-button-2"
 type="button"
 onClick={() => selectOption({ value: query, label: query })}
 className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-indigo-50 border-b border-gray-50"
 >
 <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
 <Plus size={14} strokeWidth={3} />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold text-indigo-600 truncate">Add"{query}"</p>
 <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">New Entry</p>
 </div>
 </button>
 )}
 {flatFiltered.length === 0 && !allowCustom ? (
 <div className="py-8 text-center text-sm text-gray-400">
 <Search size={20} className="mx-auto mb-2 opacity-40" />
 No results for"{query}"
 </div>
 ) : grouped ? (
 Object.entries(groupedOptions).map(([group, opts]) => (
 <div key={group}>
 {group && (
 <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/80 border-b border-gray-100">
 {group}
 </div>
 )}
 {opts.map((opt) => {
 const globalIndex = flatFiltered.indexOf(opt);
 return (
 <OptionItem
 key={opt.value}
 option={opt}
 isSelected={opt.value === value}
 isHighlighted={globalIndex === highlighted}
 onSelect={() => selectOption(opt)}
 onHover={() => setHighlighted(globalIndex)}
 testId={testId ? `${testId}-option-${opt.value}` : undefined}
 />
 );
 })}
 </div>
 ))
 ) : (
 flatFiltered.map((opt, index) => (
 <OptionItem
 key={opt.value}
 option={opt}
 isSelected={opt.value === value}
 isHighlighted={index === highlighted}
 onSelect={() => selectOption(opt)}
 onHover={() => setHighlighted(index)}
 testId={testId ? `${testId}-option-${opt.value}` : undefined}
 />
 ))
 )}
 </div>
 </div>,
 document.body
 )}
 </div>
 );
};

const OptionItem: React.FC<{
 option: DropdownOption;
 isSelected: boolean;
 isHighlighted: boolean;
 onSelect: () => void;
 onHover: () => void;
 testId?: string;
}> = ({ option, isSelected, isHighlighted, onSelect, onHover, testId }) => (
 <button
 type="button"
 role="option"
 aria-selected={isSelected}
 data-option
 onClick={onSelect}
 onMouseEnter={onHover}
 data-testid={testId}
 className={cn(
 'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
 isHighlighted ? 'bg-indigo-50' : 'hover:bg-gray-50',
 isSelected && 'bg-indigo-50/70',
 )}
 >
 {option.icon && <span className="text-lg shrink-0 w-7 flex items-center justify-center">{option.icon}</span>}
 <div className="flex-1 min-w-0">
 <p className={cn('text-sm font-semibold truncate', isSelected ? 'text-indigo-700' : 'text-gray-900')}>{option.label}</p>
 {option.description && <p className="text-xs text-gray-500 truncate">{option.description}</p>}
 </div>
 {isSelected && <Check size={15} className="text-indigo-600 shrink-0" />}
 </button>
);
