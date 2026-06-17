import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, PieChart, Target, Award, Users, 
  CheckCircle2, BarChart3, Gem, ShieldCheck, 
  Lock, ChevronRight, ChevronLeft, ArrowRight 
} from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';

interface AppFeatureSlidesProps {
  onComplete: () => void;
}

interface SlideData {
  title: string;
  subtitle: string;
  tagline: string;
  gradient: string;
  accentColor: string;
  icon: React.ReactNode;
  visual: React.ReactNode;
}

export const AppFeatureSlides: React.FC<AppFeatureSlidesProps> = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward

  const slides: SlideData[] = [
    {
      title: "Smart Expense Tracking",
      tagline: "KNOW YOUR FLOW",
      subtitle: "Automatically scan bills, categorize your spending, and monitor your cash flow in real-time.",
      gradient: "from-blue-500 to-indigo-600",
      accentColor: "bg-blue-600",
      icon: <Wallet className="w-8 h-8 text-blue-600" />,
      visual: (
        <div className="w-full flex flex-col gap-3 p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-white/50 shadow-lg">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500">June Budget</span>
            <span className="text-sm font-black text-gray-900">₹40,000 Left</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-700">
              <span className="flex items-center gap-1.5 font-medium">🛒 Shopping</span>
              <span className="font-bold">₹12,355</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-[65%]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-700">
              <span className="flex items-center gap-1.5 font-medium">🍔 Food & Drinks</span>
              <span className="font-bold">₹2,762</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-[30%]" />
            </div>
          </div>
          <div className="pt-1 flex justify-between items-center text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-1.5 rounded-lg border border-emerald-100">
            <span>Daily average spend down 12%</span>
            <span>₹800/day</span>
          </div>
        </div>
      )
    },
    {
      title: "Smart Savings Goals",
      tagline: "ACHIEVE YOUR DREAMS",
      subtitle: "Set individual or collaborative group savings goals with intelligent timeline forecasts.",
      gradient: "from-emerald-500 to-teal-600",
      accentColor: "bg-emerald-600",
      icon: <Target className="w-8 h-8 text-emerald-600" />,
      visual: (
        <div className="w-full flex flex-col gap-3.5 p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-white/50 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800">🚗 New Car Goal</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">70% Met</span>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Saved So Far</p>
              <p className="text-lg font-black text-gray-900">₹7,00,000</p>
            </div>
            <p className="text-[10px] text-gray-500 font-semibold mb-0.5">Target: ₹10,00,000</p>
          </div>
          <div className="relative pt-1">
            <div className="overflow-hidden h-3 text-xs flex rounded-full bg-gray-200">
              <div className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500 w-[70%]" />
            </div>
          </div>
          <div className="flex gap-2 text-[10px] font-semibold text-gray-500 bg-gray-50 p-2 rounded-xl">
            <Award className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>On track to reach your goal by December 2026</span>
          </div>
        </div>
      )
    },
    {
      title: "Shared Group Expenses",
      tagline: "AWKWARD SPLITS SOLVED",
      subtitle: "Coordinate trips, dinners, and group bills without the messy math. Settle up in seconds.",
      gradient: "from-violet-500 to-purple-600",
      accentColor: "bg-purple-600",
      icon: <Users className="w-8 h-8 text-purple-600" />,
      visual: (
        <div className="w-full flex flex-col gap-3 p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-white/50 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-800">✈️ Goa Trip 2026</span>
            <span className="text-[10px] font-medium text-purple-600">3 Friends</span>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-bold text-[10px] text-blue-700">SA</div>
                <span className="font-semibold text-gray-700">Shaik Ashraf</span>
              </div>
              <span className="text-emerald-600 font-bold">Owes you ₹4,500</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center font-bold text-[10px] text-pink-700">JD</div>
                <span className="font-semibold text-gray-700">John Doe</span>
              </div>
              <span className="text-rose-600 font-bold">You owe ₹1,200</span>
            </div>
          </div>
          <div className="mt-1 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
            <span className="font-bold text-gray-800">Net Balance</span>
            <span className="text-emerald-600 font-black">₹3,300 Owed to You</span>
          </div>
        </div>
      )
    },
    {
      title: "Portfolio & Investments",
      tagline: "GROW YOUR NET WORTH",
      subtitle: "Track stocks, mutual funds, gold, and your overall assets with real-time portfolio tracking.",
      gradient: "from-amber-500 to-orange-600",
      accentColor: "bg-amber-600",
      icon: <BarChart3 className="w-8 h-8 text-amber-600" />,
      visual: (
        <div className="w-full flex flex-col gap-3.5 p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-white/50 shadow-lg">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-800">Portfolio Value</span>
            <span className="text-xs font-black text-emerald-600 flex items-center gap-0.5">
              +₹12,450 (8.9%)
            </span>
          </div>
          <p className="text-xl font-black text-gray-900 leading-none">₹1,52,580</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
              <Gem className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-[9px] text-gray-500 font-semibold">Gold</p>
                <p className="font-bold text-gray-800">₹32,580</p>
              </div>
            </div>
            <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-[9px] text-gray-500 font-semibold">Stocks</p>
                <p className="font-bold text-gray-800">₹1,20,000</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Bank-Grade Encryption",
      tagline: "YOUR DATA IS SECURE",
      subtitle: "All your data is locally encrypted on your device. We use industry-standard security protocols to keep your information secure.",
      gradient: "from-rose-500 to-red-600",
      accentColor: "bg-rose-600",
      icon: <ShieldCheck className="w-8 h-8 text-rose-600" />,
      visual: (
        <div className="w-full flex flex-col items-center justify-center p-4 bg-white/70 backdrop-blur-md rounded-2xl border border-white/50 shadow-lg gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
            <Lock className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-xs font-black text-gray-900">Device-Level Encryption Active</p>
            <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed">
              Your financial records are secured using AES-256 local encryption key.
            </p>
          </div>
          <div className="flex gap-1.5 items-center bg-gray-50 px-2 py-1 rounded-full border border-gray-100 text-[9px] font-bold text-gray-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Local-First Sync Ready</span>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    setDirection(1);
    setCurrentSlide(slides.length - 1);
  };

  const slide = slides[currentSlide];

  // Framer Motion variants
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 300, damping: 30 },
        opacity: { duration: 0.25 }
      }
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
      transition: {
        x: { type: "spring" as const, stiffness: 300, damping: 30 },
        opacity: { duration: 0.25 }
      }
    })
  } as import('framer-motion').Variants;

  return (
    <div data-testid="onboarding-slides-container" className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/40 backdrop-blur-xl rounded-[32px] border border-white/70 shadow-2xl p-6 md:p-8 flex flex-col justify-between min-h-[600px] relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full bg-gradient-to-br ${slide.gradient} opacity-20 blur-3xl`} />
        <div className={`absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-gradient-to-tr ${slide.gradient} opacity-10 blur-3xl`} />

        {/* Top Header */}
        <div className="flex items-center justify-between mb-4 z-10 relative">
          <div className="flex items-center gap-1.5">
            <KANAKULogo className="w-8 h-8" />
            <span className="text-lg font-black tracking-tight text-gray-900">KANAKU</span>
          </div>
          {currentSlide < slides.length - 1 && (
            <button
              onClick={handleSkip}
              data-testid="onboarding-slides-skip-button"
              className="text-xs font-bold text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-wider"
            >
              Skip
            </button>
          )}
        </div>

        {/* Slides Content */}
        <div className="flex-1 flex flex-col justify-center py-4 z-10 relative">
          <div className="overflow-hidden min-h-[360px] flex items-center justify-center relative">
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={currentSlide}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full flex flex-col items-center gap-6"
                data-testid={`onboarding-slides-slide-${currentSlide}`}
              >
                {/* Custom Card Visual */}
                <div className="w-full max-w-[280px] min-h-[180px] flex items-center justify-center relative">
                  {slide.visual}
                </div>

                {/* Text Content */}
                <div className="text-center px-4 space-y-2.5">
                  <div className="flex items-center justify-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-full ${slide.accentColor} text-white`}>
                      {slide.tagline}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-gray-950 tracking-tight leading-tight">
                    {slide.title}
                  </h2>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed max-w-[280px] mx-auto">
                    {slide.subtitle}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="pt-6 border-t border-gray-100 flex flex-col gap-6 z-10 relative">
          {/* Progress Indicators */}
          <div className="flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setDirection(i > currentSlide ? 1 : -1);
                  setCurrentSlide(i);
                }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentSlide 
                    ? `w-6 ${slide.accentColor}` 
                    : 'w-2 bg-gray-200 hover:bg-gray-300'
                }`}
                aria-label={`Go to slide ${i + 1}`}
                data-testid={`onboarding-slides-dot-${i}`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-4">
            {currentSlide > 0 ? (
              <button
                onClick={handleBack}
                data-testid="onboarding-slides-back-button"
                className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors py-2 px-3 rounded-xl hover:bg-gray-50"
              >
                <ChevronLeft size={16} /> Back
              </button>
            ) : (
              <div />
            )}

            {currentSlide < slides.length - 1 ? (
              <button
                onClick={handleNext}
                data-testid="onboarding-slides-next-button"
                className={`flex items-center gap-1 px-5 py-2.5 rounded-2xl text-sm font-black text-white ${slide.accentColor} hover:scale-105 active:scale-95 shadow-md hover:shadow-lg transition-all`}
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleNext}
                data-testid="onboarding-slides-complete-button"
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-black text-white bg-gray-950 hover:bg-black active:scale-[0.98] shadow-lg hover:shadow-xl transition-all"
              >
                Continue to Secure PIN Setup <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
