import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { canInstallPWA, showInstallPrompt, isAppInstalled } from '@/lib/pwa';

export const PWAInstallPrompt: React.FC = () => {
 const [showPrompt, setShowPrompt] = useState(false);
 const [isInstalling, setIsInstalling] = useState(false);
 const promptShown = useRef(false);

 useEffect(() => {
 // Check if app is already installed
 if (isAppInstalled()) {
 return;
 }

 // Check if user has dismissed the prompt before
 const dismissed = localStorage.getItem('pwa_install_dismissed');
 if (dismissed) {
 const dismissedTime = parseInt(dismissed);
 const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
 
 // Don't show again for 7 days after dismissal
 if (daysSinceDismissed < 7) {
 return;
 }
 }

 const revealPrompt = () => {
 if (promptShown.current) return;
 if (!canInstallPWA()) return;
 promptShown.current = true;
 setShowPrompt(true);
 };

 const timer = setTimeout(() => {
 revealPrompt();
 }, 3000);

 const onReady = () => {
 if (!isAppInstalled()) {
 revealPrompt();
 }
 };
 window.addEventListener('pwainstallready', onReady);

 return () => {
 clearTimeout(timer);
 window.removeEventListener('pwainstallready', onReady);
 };
 }, []);

 const handleInstall = async () => {
 setIsInstalling(true);
 const installed = await showInstallPrompt();
 
 if (installed) {
 setShowPrompt(false);
 localStorage.removeItem('pwa_install_dismissed');
 } else {
 setIsInstalling(false);
 setShowPrompt(true);
 }
 };

 const handleDismiss = () => {
 setShowPrompt(false);
 localStorage.setItem('pwa_install_dismissed', Date.now().toString());
 };

 return (
 <AnimatePresence>
 {showPrompt && (
 <motion.div
 initial={{ y: 100, opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: 100, opacity: 0 }}
 className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-50"
 >
 <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
 {/* Header with gradient */}
 <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
 <div className="flex items-start justify-between">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
 <Smartphone className="w-6 h-6" />
 </div>
 <div>
 <h3 className="font-bold text-lg">Install KANAKU</h3>
 <p className="text-xs text-blue-100 mt-0.5">Quick access from your home screen</p>
 </div>
 </div>
 <button
 type="button"
 onClick={handleDismiss}
 aria-label="Dismiss install prompt"
 title="Dismiss install prompt"
 className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
 >
 <X size={18} />
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="p-4">
 <ul className="space-y-2 mb-4">
 {[
 'Works offline - no internet required',
 'Fast access from home screen',
 'Push notifications for reminders',
 'Native app-like experience',
 ].map((feature, index) => (
 <li key={index} className="flex items-center gap-2 text-sm text-gray-700">
 <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
 {feature}
 </li>
 ))}
 </ul>

 <button
 onClick={handleInstall}
 disabled={isInstalling}
 className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30"
 >
 {isInstalling ? (
 <>
 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
 Installing...
 </>
 ) : (
 <>
 <Download size={20} />
 Install App
 </>
 )}
 </button>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 );
};

