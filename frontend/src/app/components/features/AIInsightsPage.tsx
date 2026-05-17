import React, { useState } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Brain, TrendingUp, Sparkles, DollarSign, ArrowRight, Zap, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export const AIInsightsPage: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState([
    {
      id: 1,
      title: 'Smart Saving Opportunity',
      type: 'saving',
      icon: DollarSign,
      color: 'text-emerald-500 bg-emerald-500/10',
      description: 'Your grocery spending is 15% higher than your average for this day of the month. Shopping at wholesale markets could save you approximately ₹1,200 monthly.',
      impact: 'High Impact',
      impactColor: 'text-emerald-600 bg-emerald-50 border-emerald-200'
    },
    {
      id: 2,
      title: 'Subscription Rationalization',
      type: 'subscription',
      icon: Zap,
      color: 'text-indigo-500 bg-indigo-500/10',
      description: 'You are currently paying for three distinct streaming services, but have only used one in the last 30 days. Canceling underutilized plans would recover ₹650/month.',
      impact: 'Medium Impact',
      impactColor: 'text-indigo-600 bg-indigo-50 border-indigo-200'
    },
    {
      id: 3,
      title: 'Category Projection Alert',
      type: 'projection',
      icon: TrendingUp,
      color: 'text-amber-500 bg-amber-500/10',
      description: 'Based on current trends, your dining out expenses are on track to exceed your set budget by ₹2,300. Try cooking at home on weekends to flatten this projection.',
      impact: 'Moderate Risk',
      impactColor: 'text-amber-600 bg-amber-50 border-amber-200'
    }
  ]);

  const handleReanalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      toast.success('AI Insights refreshed with your latest transactions!');
    }, 1500);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6">
          <PageHeader
            title="AI Insights"
            subtitle="AI-powered spending insights and personalized recommendations"
            icon={<Brain className="text-purple-600" size={20} />}
          />
        </div>

        {/* Hero Section */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-800 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20 text-white mb-4">
                <Sparkles size={10} /> Powered by Gemini AI
              </span>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2">Unlock Smart Spending Suggestions</h3>
              <p className="text-purple-100 text-sm leading-relaxed font-medium">
                Our advanced AI engine parses your recurring purchases, category velocities, and budget boundaries in real-time to generate custom safety nets and micro-savings opportunities.
              </p>
            </div>
            <button
              onClick={handleReanalyze}
              disabled={isAnalyzing}
              className="bg-white text-indigo-900 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-50 active:scale-95 transition-all shadow-lg text-center shrink-0 disabled:opacity-50"
            >
              {isAnalyzing ? 'Analyzing Feed...' : 'Trigger Smart Scan'}
            </button>
          </div>
        </div>

        {/* Insights Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {insights.map((insight) => {
            const Icon = insight.icon;
            return (
              <motion.div key={insight.id} variants={itemVariants}>
                <Card variant="glass" className="h-full border-white/40 flex flex-col p-8 hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${insight.color}`}>
                      <Icon size={22} />
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${insight.impactColor}`}>
                      {insight.impact}
                    </span>
                  </div>

                  <h4 className="text-lg font-black text-gray-900 mb-2 tracking-tight">{insight.title}</h4>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6 flex-1">
                    {insight.description}
                  </p>

                  <button className="inline-flex items-center gap-1.5 text-indigo-600 text-xs font-black uppercase tracking-widest group mt-auto hover:text-indigo-800 transition-colors">
                    Apply Action Plan <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Quick Advice Panel */}
        <div className="mt-8 bg-slate-50 border border-slate-100 rounded-[32px] p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
              <Target size={20} className="text-indigo-600" />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Active Financial Objectives</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100/55 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Savings Rate</p>
              <h4 className="text-xl font-black text-slate-900">22% of Salary</h4>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: '68%' }} />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">Currently at 15.4% (₹7,800 to go)</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100/55 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Debt Reduction Pace</p>
              <h4 className="text-xl font-black text-slate-900">Accelerated</h4>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: '90%' }} />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">Interest burden lowered by ₹450/month</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100/55 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Emergency Fund Coverage</p>
              <h4 className="text-xl font-black text-slate-900">4.5 Months</h4>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '75%' }} />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">Goal: 6 months of expenses</p>
            </div>
          </div>
        </div>
      </div>
    </CenteredLayout>
  );
};

export default AIInsightsPage;
