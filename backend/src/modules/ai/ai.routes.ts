import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, getUserId } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { captureAIEvent } from './ai.controller';
import { aiEventBodySchema } from './ai.validation';
import { getAIQuotaInfo } from '../../utils/aiUsageTracker';
import { requireAIFeature } from '../../middleware/featureGate';
import {
  runAllAgents,
  runFinancialHealthScoreAgent,
  runBudgetOptimizationAgent,
  runGoalRecommendationAgent,
  runBillPredictionAgent,
  runFraudDetectionAgent,
  runSpendingPatternAgent,
  runInvestmentSuggestionAgent,
} from './agents';

const router = Router();

router.use(authMiddleware);
router.post('/events', validateBody(aiEventBodySchema), captureAIEvent);

// Return the authenticated user's current AI usage quota
router.get('/quota', async (req: AuthRequest, res: Response) => {
  const info = await getAIQuotaInfo(getUserId(req));
  res.json(info);
});

//  AI Agents Endpoints 

// Run all agents and return consolidated insights
router.get('/insights', requireAIFeature('aiAutomation'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const results = await runAllAgents(userId);

    const allRecommendations = results.flatMap(r => r.output?.recommendations ?? []);
    const allInsights = results.flatMap(r => r.output?.insights ?? []);
    const healthScore = results.find(r => r.agentName === 'financial-health-score')?.output?.score;
    const fraudFlags = results.find(r => r.agentName === 'fraud-detection')?.output?.flags ?? [];
    const billPredictions = results.find(r => r.agentName === 'bill-prediction')?.output?.predictions ?? [];

    res.json({
      healthScore,
      recommendations: allRecommendations.sort((a, b) => b.priority - a.priority).slice(0, 10),
      insights: allInsights,
      fraudAlerts: fraudFlags.filter((f) => f.severity !== 'low'),
      upcomingBills: billPredictions.slice(0, 5),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
});

router.get('/health-score', requireAIFeature('aiAutomation', 'healthScoring'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await runFinancialHealthScoreAgent(getUserId(req));
    res.json(result.output);
  } catch { res.status(500).json({ error: 'Failed to compute health score' }); }
});

router.get('/recommendations', requireAIFeature('aiAutomation', 'smartCategorization'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const [budget, goals, investments] = await Promise.all([
      runBudgetOptimizationAgent(userId),
      runGoalRecommendationAgent(userId),
      runInvestmentSuggestionAgent(userId),
    ]);
    const all = [...(budget.output?.recommendations ?? []), ...(goals.output?.recommendations ?? []), ...(investments.output?.recommendations ?? [])];
    res.json({ recommendations: all.sort((a, b) => b.priority - a.priority) });
  } catch { res.status(500).json({ error: 'Failed to fetch recommendations' }); }
});

router.get('/fraud-alerts', requireAIFeature('aiAutomation', 'anomalyDetection'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await runFraudDetectionAgent(getUserId(req));
    res.json({ flags: result.output?.flags ?? [] });
  } catch { res.status(500).json({ error: 'Failed to check fraud alerts' }); }
});

router.get('/bill-predictions', requireAIFeature('aiAutomation', 'subscriptionDetection'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await runBillPredictionAgent(getUserId(req));
    res.json({ predictions: result.output?.predictions ?? [] });
  } catch { res.status(500).json({ error: 'Failed to get bill predictions' }); }
});

router.get('/spending-patterns', requireAIFeature('aiAutomation', 'smartCategorization'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await runSpendingPatternAgent(getUserId(req));
    res.json({ insights: result.output?.insights ?? [] });
  } catch { res.status(500).json({ error: 'Failed to analyze spending patterns' }); }
});

export { router as aiRoutes };
