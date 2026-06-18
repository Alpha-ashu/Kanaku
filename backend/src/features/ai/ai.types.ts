export type AIInsightType =
  | 'overspending_alert'
  | 'high_category_concentration'
  | 'income_irregularity'
  | 'recurring_expense_detected'
  | 'goal_risk_prediction'
  | 'unusual_spend_spike';

export interface UserFeatureSnapshot {
  userId: string;
  avgSpend: number;
  monthlyIncome: number;
  savingsRate: number;
  topCategory: string;
  riskScore: number;
  peakDay: string;
  featureData: Record<string, unknown>;
  updatedAt: string;
}

export interface AIInsightRecord {
  id: string;
  userId: string;
  insightType: AIInsightType;
  insightData: Record<string, unknown>;
  confidenceScore: number;
  createdAt: string;
}

export interface AIOverview {
  usersAnalyzed: number;
  activeModels: number;
  lastTrainingTime: string | null;
  dataProcessed: number;
  insightsGenerated: number;
  riskAlerts: number;
}

export interface AIUserIntelligenceRow {
  userId: string;
  email: string;
  name: string;
  spendScore: number;
  riskScore: number;
  savingsRate: number;
  topCategory: string;
  avgSpend: number;
}
