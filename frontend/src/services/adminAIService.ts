import { apiClient } from '@/lib/api';

export interface AIOverviewDto {
  usersAnalyzed: number;
  activeModels: number;
  lastTrainingTime: string | null;
  dataProcessed: number;
  insightsGenerated: number;
  riskAlerts: number;
}

export interface AIUserIntelligenceDto {
  userId: string;
  email: string;
  name: string;
  spendScore: number;
  riskScore: number;
  savingsRate: number;
  topCategory: string;
  avgSpend: number;
}

export interface AIInsightFeedDto {
  id: string;
  userId: string;
  userEmail: string;
  insightType: string;
  insightData: Record<string, unknown>;
  confidenceScore: number;
  createdAt: string;
}

export interface AIPatternAnalyticsDto {
  categoryDistribution: Array<{ category: string; users: number }>;
  insightTrends: Array<{ insightType: string; total: number }>;
  monthlyGrowth: Array<{ month: string; income: number; expense: number; net: number }>;
}

export interface AIAccuracyDto {
  totalPredictions: number;
  averageConfidence: number;
  highConfidenceRate: number;
  falsePositiveRate: number;
  successRate: number;
}

export interface AIRawUserDataDto {
  features: {
    userId: string;
    avgSpend: number;
    monthlyIncome: number;
    savingsRate: number;
    topCategory: string;
    riskScore: number;
    peakDay: string;
    featureData: Record<string, unknown>;
    updatedAt: string;
  } | null;
  insights: Array<{
    id: string;
    insightType: string;
    insightData: Record<string, unknown>;
    confidenceScore: number;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

export const adminAIService = {
  getOverview: async () => {
    const res = await apiClient.get<AIOverviewDto>('/admin/ai/overview');
    return res.data;
  },
  
  getUsers: async (limit = 50) => {
    const res = await apiClient.get<AIUserIntelligenceDto[]>(`/admin/ai/users?limit=${limit}`);
    return res.data;
  },
  
  getInsights: async (limit = 80) => {
    const res = await apiClient.get<AIInsightFeedDto[]>(`/admin/ai/insights?limit=${limit}`);
    return res.data;
  },
  
  getPatterns: async () => {
    const res = await apiClient.get<AIPatternAnalyticsDto>('/admin/ai/patterns');
    return res.data;
  },
  
  getAccuracy: async () => {
    const res = await apiClient.get<AIAccuracyDto>('/admin/ai/accuracy');
    return res.data;
  },
  
  getRawUserData: async (userId: string) => {
    const res = await apiClient.get<AIRawUserDataDto>(`/admin/ai/raw/${userId}`);
    return res.data;
  },
  
  runFeatureEngine: async () => {
    const res = await apiClient.post<{ processedUsers: number }>('/admin/ai/run/features', {});
    return res.data;
  },
  
  runPredictionEngine: async () => {
    const res = await apiClient.post<{ processedUsers: number }>('/admin/ai/run/predictions', {});
    return res.data;
  },
  
  getAIConfig: async () => {
    const res = await apiClient.get<any>('/admin/ai/config');
    return res.data;
  },

  updateAIConfig: async (config: any) => {
    const res = await apiClient.post<any>('/admin/ai/config', config);
    return res.data;
  },
};

