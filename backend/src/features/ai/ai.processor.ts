import { Request, Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { prisma } from '../../db/prisma';
import { sanitizeAIInput } from '../../utils/sanitize';
import { incrementAIUsage } from '../../utils/aiUsageTracker';
import { audit } from '../../utils/auditLogger';

//  BACKEND AI EXTRACTION LOGIC
// Simplified version of KANAKUAI for backend processing

async function extractExpenseDataBackend(text: string, source: 'ocr' | 'voice'): Promise<{
  amount?: number;
  merchant?: string;
  date?: string;
  category?: string;
  confidence: number;
}> {
  console.log(` Backend AI extracting from ${source}: "${text}"`);

  const result = {
    amount: extractAmount(text),
    merchant: extractMerchant(text),
    date: extractDate(text),
    category: classifyCategory(text),
    confidence: 0.5,
  };

  // Calculate confidence based on extracted data
  let dataPoints = 0;
  let totalConfidence = 0;

  if (result.amount) { dataPoints++; totalConfidence += 0.9; }
  if (result.merchant) { dataPoints++; totalConfidence += 0.8; }
  if (result.date) { dataPoints++; totalConfidence += 0.7; }
  if (result.category) { dataPoints++; totalConfidence += 0.6; }

  result.confidence = dataPoints > 0 ? totalConfidence / dataPoints : 0.5;

  console.log(' Backend AI extracted:', result);
  return result;
}

function extractAmount(text: string): number | undefined {
  const amountPatterns = [
    /(?:total|amount|sum|payable|due|bill|charge|spent|cost|price|rupees?|rs|)\s*([\d,]+(?:\.\d{2})?)/i,
    /([\d,]+(?:\.\d{2})?)\s*(?:rupees?|rs|)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) {
        return amount;
      }
    }
  }
  return undefined;
}

function extractMerchant(text: string): string | undefined {
  const merchants = [
    'dominos', 'pizza hut', 'kfc', 'mcdonalds', 'burger king', 'subway', 'starbucks',
    'amazon', 'flipkart', 'myntra', 'ajio', 'swiggy', 'zomato', 'uber', 'ola'
  ];

  const lowerText = text.toLowerCase();
  for (const merchant of merchants) {
    if (lowerText.includes(merchant)) {
      return merchant.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  const match = text.match(datePattern);
  if (match) {
    const [, day, month, year] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  return undefined;
}

function classifyCategory(text: string): string {
  const categories = {
    'Food & Dining': ['food', 'restaurant', 'dominos', 'kfc', 'swiggy', 'zomato'],
    'Transportation': ['uber', 'ola', 'taxi', 'fuel', 'petrol'],
    'Shopping': ['amazon', 'flipkart', 'myntra', 'shopping'],
    'Bills & Utilities': ['bill', 'electricity', 'phone', 'internet'],
  };

  const lowerText = text.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category;
      }
    }
  }
  return 'Others';
}

//  AI PROCESSOR BACKEND APIs
// These endpoints handle the core AI processing logic

export const processOCRRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { imageData, source = 'receipt' } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // AI quota enforcement 
    const quota = await incrementAIUsage(userId);
    if (!quota.allowed) {
      audit({ event: 'ai.quota_exceeded', userId, meta: { current: quota.current, limit: quota.limit } });
      return res.status(429).json({ error: 'Daily AI limit reached. Try again tomorrow.', limit: quota.limit });
    }

    // Sanitise input 
    const { sanitized: cleanData, flagged } = sanitizeAIInput(imageData);
    if (flagged) {
      audit({ event: 'ai.prompt_injection', userId, resource: 'ocr', meta: { inputLength: imageData.length } });
      logger.warn('Prompt injection detected in OCR input', { userId });
    }

    audit({ event: 'ai.ocr_request', userId, meta: { source } });
    const startTime = performance.now();

    // Store raw AI data (privacy-first)
    const rawInputId = await storeAIData(userId, 'ocr', imageData, {
      source,
      timestamp: new Date().toISOString(),
    });

    //  Backend AI extraction logic (simplified version of KANAKUAI)
    const extractedData = await extractExpenseDataBackend(cleanData, 'ocr');

    const processingTime = performance.now() - startTime;
    console.log(` OCR processing completed in ${processingTime.toFixed(2)}ms`);

    // Store prediction for learning
    await storeAIPrediction(userId, 'ocr', rawInputId, extractedData, processingTime);

    // Store learning patterns
    await updateLearningPatterns(userId, extractedData);

    res.json({
      success: true,
      data: extractedData,
      processingTime,
      source: 'KANAKU-ai',
    });

  } catch (error) {
    logger.error('OCR processing failed', { error, userId: getUserId(req) });
    res.status(500).json({ error: 'Failed to process image' });
  }
};

export const processVoiceRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { transcript, audioData } = req.body;

    if (!transcript && !audioData) {
      return res.status(400).json({ error: 'Transcript or audio data is required' });
    }

    // AI quota enforcement 
    const quota = await incrementAIUsage(userId);
    if (!quota.allowed) {
      audit({ event: 'ai.quota_exceeded', userId, meta: { current: quota.current, limit: quota.limit } });
      return res.status(429).json({ error: 'Daily AI limit reached. Try again tomorrow.', limit: quota.limit });
    }

    const voiceData = transcript || audioData;

    // Sanitise input 
    const { sanitized: cleanData, flagged } = sanitizeAIInput(voiceData);
    if (flagged) {
      audit({ event: 'ai.prompt_injection', userId, resource: 'voice', meta: { inputLength: voiceData.length } });
      logger.warn('Prompt injection detected in voice input', { userId });
    }

    audit({ event: 'ai.voice_request', userId });
    const startTime = performance.now();

    // Store raw AI data (privacy-first)
    const rawInputId = await storeAIData(userId, 'voice', cleanData, {
      timestamp: new Date().toISOString(),
      hasAudio: !!audioData,
    });

    //  Backend AI extraction logic
    const extractedData = await extractExpenseDataBackend(cleanData, 'voice');

    const processingTime = performance.now() - startTime;
    console.log(` Voice processing completed in ${processingTime.toFixed(2)}ms`);

    // Store prediction for learning
    await storeAIPrediction(userId, 'voice', rawInputId, extractedData, processingTime);

    // Store learning patterns
    await updateLearningPatterns(userId, extractedData);

    res.json({
      success: true,
      data: extractedData,
      processingTime,
      source: 'KANAKU-ai',
    });

  } catch (error) {
    logger.error('Voice processing failed', { error, userId: getUserId(req) });
    res.status(500).json({ error: 'Failed to process voice input' });
  }
};

export const submitAIFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { predictionId, originalPrediction, correctedData, feedbackType, rating } = req.body;

    if (!predictionId || !correctedData) {
      return res.status(400).json({ error: 'Prediction ID and corrected data are required' });
    }

    console.log(' Storing AI feedback for user:', userId);

    // Store feedback for learning
    await prisma.$executeRaw`
      INSERT INTO ai_feedback (
        user_id, prediction_id, original_prediction, corrected_data, 
        feedback_type, feedback_rating, created_at
      )
      VALUES (
        ${userId}, ${predictionId}, ${JSON.stringify(originalPrediction)}, 
        ${JSON.stringify(correctedData)}, ${feedbackType}, ${rating}, ${new Date()}
      )
    `;

    // Update prediction with feedback
    await prisma.$executeRaw`
      UPDATE ai_predictions 
      SET feedback = ${rating >= 4 ? 'correct' : 'incorrect'}, 
          feedback_timestamp = ${new Date()}
      WHERE id = ${predictionId}
    `;

    //  Update learning patterns based on feedback (backend logic)
    if (correctedData.merchant && correctedData.category) {
      console.log(` Backend learning: ${correctedData.merchant}  ${correctedData.category}`);
      // Pattern update is handled in updateLearningPatterns function
    }

    res.json({
      success: true,
      message: 'Feedback recorded successfully',
    });

  } catch (error) {
    logger.error('AI feedback submission failed', { error, userId: getUserId(req) });
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
};

export const getAIPersonalization = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    // Get user's learning patterns
    const patterns = await prisma.$queryRaw`
      SELECT pattern_key, pattern_value, confidence_score, occurrence_count
      FROM ai_learning_patterns 
      WHERE user_id = ${userId}
        AND pattern_type = 'merchant_category'
      ORDER BY confidence_score DESC, occurrence_count DESC
      LIMIT 50
    ` as Array<{
      pattern_key: string;
      pattern_value: any;
      confidence_score: number;
      occurrence_count: number;
    }>;

    // Get recent predictions
    const recentPredictions = await prisma.$queryRaw`
      SELECT prediction_type, prediction, confidence_score, created_at
      FROM ai_predictions 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    ` as Array<{
      prediction_type: string;
      prediction: any;
      confidence_score: number;
      created_at: Date;
    }>;

    res.json({
      success: true,
      data: {
        patterns,
        recentPredictions,
        totalPatterns: patterns.length,
      },
    });

  } catch (error) {
    logger.error('Failed to get AI personalization', { error, userId: getUserId(req) });
    res.status(500).json({ error: 'Failed to get personalization data' });
  }
};

//  ADMIN-ONLY ENDPOINTS

export const getAIAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    // Admin-only check
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { role: true },
    });

    if (!user || !['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get AI usage statistics
    const usageStats = await prisma.$queryRaw`
      SELECT 
        date_bucket,
        input_type,
        total_requests,
        successful_requests,
        avg_processing_time_ms,
        avg_confidence_score,
        unique_users
      FROM ai_usage_stats 
      ORDER BY date_bucket DESC 
      LIMIT 30
    ` as Array<any>;

    // Get model performance metrics
    const modelMetrics = await prisma.$queryRaw`
      SELECT 
        model_name,
        model_version,
        metric_type,
        AVG(metric_value) as avg_value,
        SUM(sample_size) as total_samples
      FROM ai_model_metrics 
      WHERE date_bucket >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY model_name, model_version, metric_type
      ORDER BY avg_value DESC
    ` as Array<any>;

    // Get learning insights
    const learningInsights = await prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT user_id) as total_users,
        COUNT(*) as total_patterns,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN confidence_score > 0.8 THEN 1 END) as high_confidence_patterns
      FROM ai_learning_patterns
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    ` as Array<any>;

    res.json({
      success: true,
      data: {
        usageStats,
        modelMetrics,
        learningInsights,
        summary: {
          totalUsers: learningInsights[0]?.total_users || 0,
          totalPatterns: learningInsights[0]?.total_patterns || 0,
          averageConfidence: learningInsights[0]?.avg_confidence || 0,
          highConfidenceRate: learningInsights[0]?.high_confidence_patterns || 0,
        },
      },
    });

  } catch (error) {
    logger.error('Failed to get AI analytics', { error });
    res.status(500).json({ error: 'Failed to get analytics' });
  }
};

export const getAIPatterns = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 100 } = req.query;

    // Admin-only check
    const currentUser = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { role: true },
    });

    if (!currentUser || !['admin', 'superadmin'].includes(currentUser.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get user's learning patterns
    const patterns = await prisma.$queryRaw`
      SELECT 
        pattern_key,
        pattern_value,
        pattern_type,
        confidence_score,
        occurrence_count,
        success_count,
        failure_count,
        last_seen,
        created_at
      FROM ai_learning_patterns 
      WHERE user_id = ${userId}
      ORDER BY confidence_score DESC, occurrence_count DESC
      LIMIT ${Number(limit)}
    ` as Array<any>;

    res.json({
      success: true,
      data: {
        userId,
        patterns,
        total: patterns.length,
      },
    });

  } catch (error) {
    logger.error('Failed to get AI patterns', { error });
    res.status(500).json({ error: 'Failed to get patterns' });
  }
};

//  HELPER FUNCTIONS (Privacy-first)

async function storeAIData(
  userId: string,
  inputType: 'ocr' | 'voice' | 'manual',
  rawInput: string,
  metadata: any
): Promise<string> {
  const id = `raw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await prisma.$executeRaw`
    INSERT INTO ai_raw_data (
      id, user_id, input_type, raw_input, processed_data, 
      source_device, created_at, expires_at
    )
    VALUES (
      ${id}, ${userId}, ${inputType}, ${rawInput}, ${JSON.stringify(metadata)},
      ${metadata.sourceDevice || 'web'}, ${new Date()}, 
      ${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)}
    )
  `;

  return id;
}

async function storeAIPrediction(
  userId: string,
  inputType: 'ocr' | 'voice',
  rawInputId: string,
  prediction: any,
  processingTime: number
): Promise<string> {
  const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await prisma.$executeRaw`
    INSERT INTO ai_predictions (
      id, user_id, prediction_type, input_hash, prediction, 
      confidence_score, processing_time_ms, model_version, created_at
    )
    VALUES (
      ${id}, ${userId}, 'expense', ${hashInput(rawInputId)}, ${JSON.stringify(prediction)},
      ${prediction.confidence || 0.5}, ${processingTime}, 'KANAKU-v1.0', ${new Date()}
    )
  `;

  return id;
}

async function updateLearningPatterns(userId: string, extractedData: any): Promise<void> {
  if (extractedData.merchant && extractedData.category) {
    const patternKey = extractedData.merchant.toLowerCase().trim();
    const patternValue = {
      category: extractedData.category,
      confidence: extractedData.confidence,
    };

    await prisma.$executeRaw`
      INSERT INTO ai_learning_patterns (
        user_id, pattern_type, pattern_key, pattern_value, 
        confidence_score, occurrence_count, success_count, last_seen
      )
      VALUES (
        ${userId}, 'merchant_category', ${patternKey}, ${JSON.stringify(patternValue)},
        ${extractedData.confidence || 0.5}, 1, 1, ${new Date()}
      )
      ON CONFLICT (user_id, pattern_type, pattern_key) 
      DO UPDATE SET
        pattern_value = EXCLUDED.pattern_value,
        confidence_score = EXCLUDED.confidence_score,
        occurrence_count = ai_learning_patterns.occurrence_count + 1,
        success_count = ai_learning_patterns.success_count + 1,
        last_seen = EXCLUDED.last_seen
    `;
  }
}

function hashInput(input: string): string {
  // Simple hash function - in production, use crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

