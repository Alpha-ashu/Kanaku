// =====================================================
// Database Helper Functions (API-Only)
// =====================================================
// IMPORTANT: All database operations route through /api/v1/* endpoints.
// Direct Supabase access from frontend has been removed for security.
// =====================================================

import { apiClient } from '@/lib/api';
import supabase from '@/utils/supabase/client';

// =====================================================
// TYPE DEFINITIONS (matching database schema)
// =====================================================

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  currency: string;
  language: string;
  pin_code: string | null;
  visible_features: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: number;
  user_id: string;
  name: string;
  type: 'bank' | 'card' | 'cash' | 'wallet';
  balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Transaction {
  id: number;
  user_id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  account_id: number;
  category: string;
  subcategory: string | null;
  description: string;
  merchant: string | null;
  date: string;
  tags: string[] | null;
  attachment: string | null;
  transfer_to_account_id: number | null;
  transfer_type: 'self-transfer' | 'other-transfer' | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// =====================================================
// AUTHENTICATION HELPERS
// =====================================================

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

/**
 * Generic, non-enumerable message shown when an account cannot be created
 * because the email (or, server-side, the phone) is already taken. It is
 * deliberately vague: it never confirms to an attacker that a specific email
 * exists, while still guiding a legitimate user to sign in or try other
 * details. See quality/reports for the duplicate-registration test record.
 */
export const DUPLICATE_ACCOUNT_MESSAGE =
  "We couldn't create your account with these details. If you already have an account, please sign in — otherwise try a different email or phone number.";

export async function signUp(email: string, password: string, fullName?: string) {
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: appUrl, // Supabase will add hash params with tokens
      data: {
        full_name: fullName,
        role: 'customer',
      },
    },
  });

  // When email confirmations are OFF, Supabase surfaces a real error for a
  // duplicate signup (code: user_already_exists / status 422).
  if (error) {
    const status = (error as any)?.status;
    const code = (error as any)?.code;
    if (status === 422 || code === 'user_already_exists') {
      const dupErr = new Error(DUPLICATE_ACCOUNT_MESSAGE) as Error & { code?: string };
      dupErr.code = 'EMAIL_EXISTS';
      throw dupErr;
    }
    throw error;
  }

  // SECURITY / BUGFIX: When email confirmations are ON, Supabase deliberately
  // does NOT return an error for a duplicate signup (anti-enumeration). It
  // instead returns an obfuscated user whose `identities` array is empty and
  // with no active session. If we treat that as success the duplicate email
  // silently proceeds into onboarding ("account created"), which is the bug
  // reported by users. Detect the fake-success and block it.
  const identities = (data?.user as any)?.identities;
  const isObfuscatedDuplicate =
    !!data?.user && Array.isArray(identities) && identities.length === 0;
  if (isObfuscatedDuplicate) {
    const dupErr = new Error(DUPLICATE_ACCOUNT_MESSAGE) as Error & { code?: string };
    dupErr.code = 'EMAIL_EXISTS';
    throw dupErr;
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.warn('Supabase global signOut failed, trying local signOut:', error);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    } else {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  } catch (e) {
    console.warn('Supabase global signOut exception, trying local signOut:', e);
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

// =====================================================
// PROFILE FUNCTIONS
// =====================================================

export async function getProfile() {
  const response = await apiClient.get('/auth/profile');
  if (!response.success) throw new Error(response.message || 'Failed to fetch profile');
  return response.data as Profile;
}

export async function updateProfile(updates: Partial<Profile>) {
  const response = await apiClient.put('/auth/profile', updates);
  if (!response.success) throw new Error(response.message || 'Failed to update profile');
  return response.data;
}

// =====================================================
// ACCOUNT FUNCTIONS
// =====================================================

export async function getAccounts() {
  const response = await apiClient.get('/accounts');
  if (!response.success) throw new Error(response.message || 'Failed to fetch accounts');
  return (response.data || []) as Account[];
}

export async function getActiveAccounts() {
  const response = await apiClient.get('/accounts?active=true');
  if (!response.success) throw new Error(response.message || 'Failed to fetch accounts');
  const accounts = (response.data || []) as Account[];
  return accounts.filter(a => a.is_active && !a.deleted_at);
}

export async function createAccount(account: Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'>) {
  // SECURITY: created_at, updated_at, user_id are set server-side only
  // Client should NEVER send these fields
  const payload = {
    name: account.name,
    type: account.type,
    balance: account.balance,
    currency: account.currency,
    is_active: account.is_active,
  };
  const response = await apiClient.post('/accounts', payload);
  if (!response.success) throw new Error(response.message || 'Failed to create account');
  return response.data;
}

export async function updateAccount(id: number, updates: Partial<Account>) {
  // SECURITY: Strip server-owned fields - balance must be computed via transactions
  const { created_at, updated_at, deleted_at, user_id, ...safeUpdates } = updates;
  const response = await apiClient.put(`/accounts/${id}`, safeUpdates);
  if (!response.success) throw new Error(response.message || 'Failed to update account');
  return response.data;
}

export async function deleteAccount(id: number) {
  // Soft delete - server sets deleted_at timestamp
  const response = await apiClient.delete(`/accounts/${id}`);
  if (!response.success) throw new Error(response.message || 'Failed to delete account');
}

// =====================================================
// TRANSACTION FUNCTIONS
// =====================================================

export async function getTransactions(limit?: number) {
  const url = limit ? `/transactions?limit=${limit}` : '/transactions';
  const response = await apiClient.get(url);
  if (!response.success) throw new Error(response.message || 'Failed to fetch transactions');
  return (response.data || []) as Transaction[];
}

export async function getTransactionsByAccount(accountId: number) {
  const response = await apiClient.get(`/transactions?accountId=${accountId}`);
  if (!response.success) throw new Error(response.message || 'Failed to fetch transactions');
  return (response.data || []) as Transaction[];
}

export async function getTransactionsByDateRange(startDate: string, endDate: string) {
  const response = await apiClient.get(`/transactions?startDate=${startDate}&endDate=${endDate}`);
  if (!response.success) throw new Error(response.message || 'Failed to fetch transactions');
  return (response.data || []) as Transaction[];
}

export async function createTransaction(transaction: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'>) {
  // SECURITY: Server sets created_at, updated_at, user_id
  // Server also recomputes account balances - never trust client balance
  const payload = {
    type: transaction.type,
    amount: transaction.amount,
    account_id: transaction.account_id,
    category: transaction.category,
    subcategory: transaction.subcategory,
    description: transaction.description,
    merchant: transaction.merchant,
    date: transaction.date,
    tags: transaction.tags,
    attachment: transaction.attachment,
    transfer_to_account_id: transaction.transfer_to_account_id,
    transfer_type: transaction.transfer_type,
  };
  const response = await apiClient.post('/transactions', payload);
  if (!response.success) throw new Error(response.message || 'Failed to create transaction');
  return response.data;
}

// DEPRECATED: Balance updates must be computed server-side by summing transactions
// This function is kept for backward compatibility but does nothing
// Server recomputes balance on every transaction change
async function updateAccountBalance(_accountId: number, _amount: number) {
  // No-op: Server handles balance computation
  console.warn('updateAccountBalance is deprecated - server computes balances');
}

export async function deleteTransaction(id: number) {
  // Soft delete - server sets deleted_at timestamp and recomputes balances
  const response = await apiClient.delete(`/transactions/${id}`);
  if (!response.success) throw new Error(response.message || 'Failed to delete transaction');
}

// =====================================================
// REALTIME SUBSCRIPTIONS
// =====================================================

// DEPRECATED: Real-time subscriptions must use WebSocket through backend API
// Direct Supabase real-time access has been disabled for security
export function subscribeToTransactions(_callback: (payload: any) => void) {
  console.warn('subscribeToTransactions is deprecated - use API polling or backend WebSocket');
  return {
    unsubscribe: () => {}
  };
}

// DEPRECATED: Real-time subscriptions must use WebSocket through backend API
// Direct Supabase real-time access has been disabled for security
export function subscribeToAccounts(_callback: (payload: any) => void) {
  console.warn('subscribeToAccounts is deprecated - use API polling or backend WebSocket');
  return {
    unsubscribe: () => {}
  };
}

// =====================================================
// USAGE EXAMPLES
// =====================================================

/*

// In your React component:

import { 
  getAccounts, 
  createAccount, 
  getTransactions, 
  subscribeToTransactions 
} from '@/lib/supabase-helpers';

// Fetch accounts
const accounts = await getAccounts();

// Create new account
const newAccount = await createAccount({
  name: 'New Bank Account',
  type: 'bank',
  balance: 1000,
  currency: 'USD',
  is_active: true
});

// Fetch transactions
const transactions = await getTransactions(50); // last 50

// Subscribe to real-time updates
useEffect(() => {
  const subscription = subscribeToTransactions((payload) => {
    console.log('Transaction change:', payload);
    // Refresh your data here
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);

*/
