import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

export interface AIConfigurations {
  ocr: {
    provider: 'gemini' | 'tesseract' | 'hybrid';
    model: string;
    confidenceThreshold: number;
    mode: 'realtime' | 'queue';
    maxRetries: number;
    timeoutMs: number;
  };
  import: {
    enabled: boolean;
    formats: string[];
    columnAliases: {
      amount: string[];
      description: string[];
      date: string[];
      category: string[];
    };
    duplicateCheckWindowDays: number;
  };
  bank: {
    enabled: boolean;
    supportedBanks: string[];
    extractionConfidence: number;
    autoCategorization: boolean;
  };
  voice: {
    enabled: boolean;
    provider: 'webkit' | 'whisper' | 'gemini' | 'deepgram' | 'assemblyai';
    language: string;
    autoSaveThreshold: number;
    model: string;
  };
  deployment: {
    rolloutPercentage: number;
    activeVersion: string;
    environment: 'dev' | 'test' | 'staging' | 'prod';
    betaUsers: string[];
  };
  smartRules: {
    categoryKeywords: Record<string, string>;
  };
}

export const DEFAULT_AI_CONFIGS: AIConfigurations = {
  ocr: {
    provider: 'hybrid',
    model: 'gemini-2.5-flash',
    confidenceThreshold: 0.7,
    mode: 'realtime',
    maxRetries: 5,
    timeoutMs: 60000,
  },
  import: {
    enabled: true,
    formats: ['csv', 'xlsx'],
    columnAliases: {
      amount: ['amount', 'value', 'debit', 'credit', 'transaction amount', 'txn amount', 'amt'],
      description: ['description', 'narration', 'note', 'notes', 'remarks', 'remark', 'particulars', 'details', 'memo'],
      date: ['date', 'transaction date', 'txn date', 'value date', 'posting date', 'booking date'],
      category: ['category', 'type', 'transaction type', 'expense type'],
    },
    duplicateCheckWindowDays: 7,
  },
  bank: {
    enabled: true,
    supportedBanks: ['SBI', 'HDFC', 'ICICI', 'Axis', 'Canara'],
    extractionConfidence: 0.7,
    autoCategorization: true,
  },
  voice: {
    enabled: true,
    provider: 'webkit',
    language: 'en-US',
    autoSaveThreshold: 0.7,
    model: 'gemini-2.5-flash',
  },
  deployment: {
    rolloutPercentage: 100,
    activeVersion: 'v1.0.0',
    environment: 'dev',
    betaUsers: [],
  },
  smartRules: {
    categoryKeywords: {
      food: 'Food', eat: 'Food', eating: 'Food', lunch: 'Food', dinner: 'Food',
      breakfast: 'Food', snack: 'Food', coffee: 'Food', chai: 'Food', tea: 'Food',
      restaurant: 'Food', swiggy: 'Food', zomato: 'Food', blinkit: 'Food',
      instamart: 'Food', zepto: 'Food', hotel: 'Food', dhaba: 'Food',
      grocery: 'Groceries', groceries: 'Groceries', vegetables: 'Groceries',
      sabzi: 'Groceries', kirana: 'Groceries', milk: 'Groceries', doodh: 'Groceries',
      uber: 'Transport', ola: 'Transport', taxi: 'Transport', auto: 'Transport',
      petrol: 'Transport', diesel: 'Transport', fuel: 'Transport', metro: 'Transport',
      bus: 'Transport', train: 'Transport', rapido: 'Transport', rickshaw: 'Transport',
      rent: 'Housing', maintenance: 'Housing', society: 'Housing', flat: 'Housing',
      room: 'Housing', accommodation: 'Housing', hostel: 'Housing', pg: 'Housing',
      apartment: 'Housing', house: 'Housing', lodge: 'Housing', dormitory: 'Housing',
      electricity: 'Utilities', wifi: 'Utilities', internet: 'Utilities',
      mobile: 'Utilities', phone: 'Utilities', recharge: 'Utilities', water: 'Utilities',
      gas: 'Utilities', lpg: 'Utilities', broadband: 'Utilities',
      medicine: 'Health', doctor: 'Health', hospital: 'Health', gym: 'Health',
      pharmacy: 'Health', medical: 'Health', chemist: 'Health', clinic: 'Health',
      netflix: 'Entertainment', spotify: 'Entertainment', amazon: 'Entertainment',
      hotstar: 'Entertainment', prime: 'Entertainment', movie: 'Entertainment',
      youtube: 'Entertainment', jio: 'Entertainment', cinema: 'Entertainment',
      shopping: 'Shopping', clothes: 'Shopping', shirt: 'Shopping', dress: 'Shopping',
      flipkart: 'Shopping', myntra: 'Shopping', meesho: 'Shopping',
      school: 'Education', college: 'Education', course: 'Education', book: 'Education',
      fees: 'Education', tuition: 'Education', coaching: 'Education',
      salary: 'Salary', freelance: 'Freelance', bonus: 'Bonus', stipend: 'Salary',
      dividend: 'Investment', interest: 'Finance',
    },
  },
};

export async function getAIConfigurations(): Promise<AIConfigurations> {
  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!adminUser) {
      return DEFAULT_AI_CONFIGS;
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: adminUser.id },
    });

    if (!settings || !settings.settings) {
      return DEFAULT_AI_CONFIGS;
    }

    let parsedSettings;
    try {
      parsedSettings = typeof settings.settings === 'string'
        ? JSON.parse(settings.settings)
        : (settings.settings as any);
    } catch {
      return DEFAULT_AI_CONFIGS;
    }

    if (!parsedSettings.admin_ai_configurations) {
      return DEFAULT_AI_CONFIGS;
    }

    const loaded = parsedSettings.admin_ai_configurations;
    return {
      ocr: { ...DEFAULT_AI_CONFIGS.ocr, ...loaded.ocr },
      import: { ...DEFAULT_AI_CONFIGS.import, ...loaded.import },
      bank: { ...DEFAULT_AI_CONFIGS.bank, ...loaded.bank },
      voice: { ...DEFAULT_AI_CONFIGS.voice, ...loaded.voice },
      deployment: { ...DEFAULT_AI_CONFIGS.deployment, ...loaded.deployment },
      smartRules: { ...DEFAULT_AI_CONFIGS.smartRules, ...loaded.smartRules },
    };
  } catch (error) {
    logger.error('Failed to fetch AI configurations', { error });
    return DEFAULT_AI_CONFIGS;
  }
}

export async function updateAIConfigurations(configs: Partial<AIConfigurations>): Promise<AIConfigurations> {
  const adminUser = await prisma.user.findFirst({
    where: { role: 'admin' },
  });

  if (!adminUser) {
    throw new Error('Admin user not found in the system');
  }

  let settings = await prisma.userSettings.findUnique({
    where: { userId: adminUser.id },
  });

  let currentSettings: Record<string, any> = {};
  if (settings && settings.settings) {
    try {
      currentSettings = typeof settings.settings === 'string'
        ? JSON.parse(settings.settings)
        : (settings.settings as any);
    } catch {
      currentSettings = {};
    }
  }

  const existingConfig = currentSettings.admin_ai_configurations || DEFAULT_AI_CONFIGS;
  const mergedConfig = {
    ocr: { ...DEFAULT_AI_CONFIGS.ocr, ...existingConfig.ocr, ...configs.ocr },
    import: { ...DEFAULT_AI_CONFIGS.import, ...existingConfig.import, ...configs.import },
    bank: { ...DEFAULT_AI_CONFIGS.bank, ...existingConfig.bank, ...configs.bank },
    voice: { ...DEFAULT_AI_CONFIGS.voice, ...existingConfig.voice, ...configs.voice },
    deployment: { ...DEFAULT_AI_CONFIGS.deployment, ...existingConfig.deployment, ...configs.deployment },
    smartRules: { ...DEFAULT_AI_CONFIGS.smartRules, ...existingConfig.smartRules, ...configs.smartRules },
  };

  currentSettings.admin_ai_configurations = mergedConfig;

  if (!settings) {
    await prisma.userSettings.create({
      data: {
        userId: adminUser.id,
        settings: JSON.stringify(currentSettings),
      },
    });
  } else {
    await prisma.userSettings.update({
      where: { userId: adminUser.id },
      data: {
        settings: JSON.stringify(currentSettings),
        updatedAt: new Date(),
      },
    });
  }

  return mergedConfig;
}
