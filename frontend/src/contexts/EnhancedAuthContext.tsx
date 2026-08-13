import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { enhancedSyncService } from '../lib/enhanced-sync';
import { pinService } from '../services/pinService';
import { getDeviceInfo } from '../utils/device';
import { getConfiguredApiBase } from '@/lib/apiBase';

interface AuthState {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPinVerified: boolean;
  syncStatus: {
    isInProgress: boolean;
    lastSyncAt: string | null;
    pendingOperations: number;
  };
  error: string | null;
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: any; token: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'PIN_VERIFY_SUCCESS' }
  | { type: 'PIN_VERIFY_FAILURE' }
  | { type: 'SYNC_STATUS_UPDATE'; payload: any }
  | { type: 'CLEAR_ERROR' };

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isPinVerified: false,
  syncStatus: {
    isInProgress: false,
    lastSyncAt: null,
    pendingOperations: 0,
  },
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'LOGOUT':
      return {
        ...initialState,
      };
    case 'PIN_VERIFY_SUCCESS':
      return {
        ...state,
        isPinVerified: true,
        error: null,
      };
    case 'PIN_VERIFY_FAILURE':
      return {
        ...state,
        isPinVerified: false,
      };
    case 'SYNC_STATUS_UPDATE':
      return {
        ...state,
        syncStatus: action.payload,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (userData: any) => Promise<void>;
  logout: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  updatePin: (currentPin: string, newPin: string) => Promise<boolean>;
  syncData: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Update sync status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const syncStatus = enhancedSyncService.getSyncStatus();
      dispatch({ type: 'SYNC_STATUS_UPDATE', payload: syncStatus });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Initialize auth state from localStorage
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('user_data');
    
    if (token && user) {
      try {
        const userData = JSON.parse(user);
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user: userData, token },
        });
        
        // Initialize sync service
        enhancedSyncService.initialize(token, userData.id);
        
        // Check PIN verification status
        if (pinService.hasPin() && pinService.isPinVerified()) {
          dispatch({ type: 'PIN_VERIFY_SUCCESS' });
        }
      } catch (error) {
        console.error('Failed to restore auth state:', error);
        // Clear invalid data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
      }
    }
  }, []);

  const login = async (email: string, password: string) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await fetch(`${getConfiguredApiBase()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      
      // Store tokens
      localStorage.setItem('auth_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('user_data', JSON.stringify(data.user));

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: data.user, token: data.accessToken },
      });

      // Initialize sync service
      await enhancedSyncService.initialize(data.accessToken, data.user.id);

      // Register device
      const deviceInfo = getDeviceInfo();
      await fetch(`${getConfiguredApiBase()}/sync/register-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
        body: JSON.stringify({
          ...deviceInfo,
        }),
      });

      // Perform initial sync
      await enhancedSyncService.fullSync(data.user.id);

    } catch (error) {
      dispatch({
        type: 'AUTH_FAILURE',
        payload: error instanceof Error ? error.message : 'Login failed',
      });
      throw error;
    }
  };

  const register = async (userData: any) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await fetch(`${getConfiguredApiBase()}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }

      const data = await response.json();
      
      // Store tokens
      localStorage.setItem('auth_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('user_data', JSON.stringify(data.user));

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: data.user, token: data.accessToken },
      });

      // Initialize sync service
      await enhancedSyncService.initialize(data.accessToken, data.user.id);

      // Register device
      const deviceInfo = getDeviceInfo();
      await fetch(`${getConfiguredApiBase()}/sync/register-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
        body: JSON.stringify({
          ...deviceInfo,
        }),
      });

    } catch (error) {
      dispatch({
        type: 'AUTH_FAILURE',
        payload: error instanceof Error ? error.message : 'Registration failed',
      });
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Clear sync data
      await enhancedSyncService.clearAll();
      
      // Clear PIN data
      pinService.clearPinData();
      
      // Clear device data
      localStorage.removeItem('device_id');
      
      // Clear auth data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_data');
      localStorage.removeItem('onboarding_completed');
      
      dispatch({ type: 'LOGOUT' });
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if there's an error
      dispatch({ type: 'LOGOUT' });
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!state.token) {
      return false;
    }

    try {
      const result = await pinService.verifyPin({
        pin,
        deviceId: getDeviceInfo().deviceId,
      });

      if (result.success) {
        dispatch({ type: 'PIN_VERIFY_SUCCESS' });
        return true;
      } else {
        dispatch({ type: 'PIN_VERIFY_FAILURE' });
        return false;
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      dispatch({ type: 'PIN_VERIFY_FAILURE' });
      return false;
    }
  };

  const updatePin = async (currentPin: string, newPin: string): Promise<boolean> => {
    if (!state.token) {
      return false;
    }

    try {
      const result = await pinService.updatePin(currentPin, newPin);
      return result.success;
    } catch (error) {
      console.error('PIN update error:', error);
      return false;
    }
  };

  const syncData = async () => {
    if (!state.user || !state.token) {
      return;
    }

    try {
      await enhancedSyncService.fullSync(state.user.id);
    } catch (error) {
      console.error('Sync error:', error);
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    verifyPin,
    updatePin,
    syncData,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
