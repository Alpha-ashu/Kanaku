export type GoalCategoryKey =
  | 'housing'
  | 'utilities'
  | 'food'
  | 'transportation'
  | 'vehicle'
  | 'health'
  | 'shopping'
  | 'subscriptions'
  | 'travel'
  | 'business'
  | 'education'
  | 'entertainment'
  | 'gifts'
  | 'miscellaneous'
  | 'family'
  | 'personal'
  | 'fitness'
  | 'pets'
  | 'investment'
  | 'taxes'
  | 'emergency'
  | 'gadget'
  | 'wedding'
  | 'custom'
  | (string & {});

export const GOAL_CATEGORIES: Array<{ key: string; label: string; icon: string }> = [
  { key: 'housing', label: 'Housing', icon: '' },
  { key: 'utilities', label: 'Utilities', icon: '' },
  { key: 'food', label: 'Food', icon: '' },
  { key: 'transportation', label: 'Transport', icon: '' },
  { key: 'vehicle', label: 'Vehicle', icon: '' },
  { key: 'health', label: 'Health', icon: '' },
  { key: 'shopping', label: 'Shopping', icon: '' },
  { key: 'subscriptions', label: 'Subscriptions', icon: '' },
  { key: 'travel', label: 'Travel', icon: '' },
  { key: 'business', label: 'Business', icon: '' },
  { key: 'education', label: 'Education', icon: '' },
  { key: 'entertainment', label: 'Entertainment', icon: '' },
  { key: 'gifts', label: 'Gifts', icon: '' },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: '' },
  { key: 'family', label: 'Family', icon: '' },
  { key: 'personal', label: 'Personal', icon: '' },
  { key: 'fitness', label: 'Fitness', icon: '' },
  { key: 'pets', label: 'Pets', icon: '' },
  { key: 'investment', label: 'Investments', icon: '' },
  { key: 'taxes', label: 'Taxes', icon: '' },
  { key: 'emergency', label: 'Emergency Fund', icon: '' },
  { key: 'gadget', label: 'Gadget', icon: '' },
  { key: 'wedding', label: 'Wedding', icon: '' },
  { key: 'custom', label: 'Custom', icon: '' },
];

export const getGoalCategoryMeta = (category?: string) => {
  const found = GOAL_CATEGORIES.find((item) => item.key === category);
  return found || { key: 'custom', label: 'Custom', icon: '' };
};

export const getGoalProgress = (currentAmount: number, targetAmount: number) => {
  if (targetAmount <= 0) return 0;
  return Math.max(0, Math.min(100, (currentAmount / targetAmount) * 100));
};

export const getMonthlySuggestion = (
  targetAmount: number | string,
  currentAmount: number | string,
  targetDate?: Date | string | null,
) => {
  const target = Number(targetAmount) || 0;
  const current = Number(currentAmount) || 0;
  const remaining = Math.max(0, target - current);

  if (!targetDate) {
    return { months: 1, monthlyAmount: remaining, remaining };
  }

  const parsedDate = targetDate instanceof Date ? targetDate : new Date(targetDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return { months: 1, monthlyAmount: remaining, remaining };
  }

  const now = new Date();
  const ms = parsedDate.getTime() - now.getTime();
  const months = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24 * 30.4375)));
  const monthlyAmount = months > 0 ? remaining / months : remaining;

  return {
    months,
    monthlyAmount: Number.isFinite(monthlyAmount) ? monthlyAmount : remaining,
    remaining,
  };
};

export const getMilestoneLabel = (progress: number) => {
  if (progress >= 100) return 'Goal Completed';
  if (progress >= 75) return '75% Milestone Achieved';
  if (progress >= 50) return '50% Milestone Achieved';
  if (progress >= 25) return '25% Milestone Achieved';
  return '';
};
