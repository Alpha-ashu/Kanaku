/**
 * Device Manager Service
 * Handles device registration, FCM token management, and cross-device sync
 * Secure communication with backend device registration API
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

interface DeviceRegistrationData {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'web' | 'desktop' | 'tablet';
  osType: string;
  osVersion?: string;
  fcmToken?: string;
  apnsToken?: string;
}

interface RegisteredDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  osType: string;
  isActive: boolean;
  lastSyncedAt: string;
  createdAt: string;
}

/**
 * Generate consistent device ID based on browser fingerprint
 * Falls back to localStorage if fingerprinting fails
 */
function generateDeviceId(): string {
  const STORAGE_KEY = 'KANAKU_device_id';
  
  // Try to retrieve existing device ID from secure storage
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length > 0) {
      return stored;
    }
  } catch (e) {
    console.warn('Failed to access storage for device ID:', e);
  }

  // Generate new device ID
  const deviceId = uuidv4();

  // Store in both session and local storage for persistence across sessions
  try {
    sessionStorage.setItem(STORAGE_KEY, deviceId);
    localStorage.setItem(STORAGE_KEY, deviceId);
  } catch (e) {
    console.warn('Failed to store device ID:', e);
  }

  return deviceId;
}

/**
 * Detect device type and OS information
 */
function detectDeviceInfo(): {
  deviceType: 'mobile' | 'web' | 'desktop' | 'tablet';
  osType: string;
  osVersion: string;
  deviceName: string;
} {
  const userAgent = navigator.userAgent;
  let deviceType: 'mobile' | 'web' | 'desktop' | 'tablet' = 'web';
  let osType = 'Unknown';
  let osVersion = '';
  let deviceName = 'Web Browser';

  // Detect OS
  if (userAgent.match(/Windows/i)) {
    osType = 'Windows';
    const match = userAgent.match(/Windows NT ([\d.]+)/);
    osVersion = match ? match[1] : '';
    deviceName = 'Windows Desktop';
    deviceType = 'desktop';
  } else if (userAgent.match(/Mac/i)) {
    osType = 'macOS';
    const match = userAgent.match(/Mac OS X ([\d_]+)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
    deviceName = 'Mac Desktop';
    deviceType = 'desktop';
  } else if (userAgent.match(/Linux/i)) {
    osType = 'Linux';
    deviceName = 'Linux Desktop';
    deviceType = 'desktop';
  } else if (userAgent.match(/iPad/i)) {
    osType = 'iOS';
    deviceName = 'iPad';
    deviceType = 'tablet';
  } else if (userAgent.match(/iPhone/i)) {
    osType = 'iOS';
    deviceName = 'iPhone';
    deviceType = 'mobile';
  } else if (userAgent.match(/Android/i)) {
    osType = 'Android';
    const match = userAgent.match(/Android ([\d.]+)/);
    osVersion = match ? match[1] : '';
    
    // Detect if tablet or phone
    if (userAgent.match(/Tablet|iPad|PlayBook/i)) {
      deviceName = 'Android Tablet';
      deviceType = 'tablet';
    } else {
      deviceName = 'Android Phone';
      deviceType = 'mobile';
    }
  }

  return {
    deviceType,
    osType,
    osVersion,
    deviceName,
  };
}

/**
 * Get auth token from localStorage (Supabase session)
 */
function getAuthToken(): string | null {
  try {
    const sbKey = Object.keys(localStorage).find(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (sbKey) {
      const sessionData = localStorage.getItem(sbKey);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        return session?.access_token || null;
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve auth token:', e);
  }

  return null;
}

/**
 * Device Manager Service
 */
export class DeviceManager {
  private api: AxiosInstance;
  private deviceId: string;
  private registeredDevices: Map<string, RegisteredDevice> = new Map();

  constructor() {
    this.deviceId = generateDeviceId();

    this.api = axios.create({
      baseURL: API_BASE_URL,
    });

    // Add auth token to every request
    this.api.interceptors.request.use((config) => {
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle errors gracefully
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          // Token expired, trigger re-authentication
          console.warn('Device manager: Unauthorized. Token may be expired.');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Register device with backend
   */
  async registerDevice(
    fcmToken?: string,
    apnsToken?: string
  ): Promise<RegisteredDevice> {
    try {
      const deviceInfo = detectDeviceInfo();

      const payload: DeviceRegistrationData = {
        deviceId: this.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        osType: deviceInfo.osType,
        osVersion: deviceInfo.osVersion,
        fcmToken,
        apnsToken,
      };

      const response = await this.api.post<{
        success: boolean;
        data: RegisteredDevice;
        message: string;
      }>('/devices', payload);

      if (response.data.success) {
        this.registeredDevices.set(this.deviceId, response.data.data);
        console.log('Device registered successfully:', response.data.data);
        return response.data.data;
      }

      throw new Error(response.data.message || 'Failed to register device');
    } catch (error) {
      console.error('Device registration error:', error);
      throw error;
    }
  }

  /**
   * Get all registered devices for current user
   */
  async getDevices(): Promise<RegisteredDevice[]> {
    try {
      const response = await this.api.get<{
        success: boolean;
        data: RegisteredDevice[];
        count: number;
      }>('/devices');

      if (response.data.success) {
        response.data.data.forEach((device) => {
          this.registeredDevices.set(device.deviceId, device);
        });
        return response.data.data;
      }

      return [];
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      return [];
    }
  }

  /**
   * Get current device info
   */
  async getCurrentDevice(): Promise<RegisteredDevice | null> {
    try {
      const response = await this.api.get<{
        success: boolean;
        data: RegisteredDevice;
      }>(`/devices/${this.deviceId}`);

      if (response.data.success) {
        this.registeredDevices.set(this.deviceId, response.data.data);
        return response.data.data;
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch current device:', error);
      return null;
    }
  }

  /**
   * Update device sync timestamp (keep-alive ping)
   */
  async updateSyncTimestamp(): Promise<void> {
    try {
      await this.api.post(`/devices/${this.deviceId}/sync`, {});
      console.debug('Device sync timestamp updated');
    } catch (error) {
      // Non-critical, log but don't throw
      console.warn('Failed to update sync timestamp:', error);
    }
  }

  /**
   * Update notification tokens (FCM/APNS)
   */
  async updateNotificationTokens(
    fcmToken?: string,
    apnsToken?: string
  ): Promise<RegisteredDevice | null> {
    try {
      const payload: Record<string, any> = {};

      if (fcmToken) {
        payload.fcmToken = fcmToken;
      }

      if (apnsToken) {
        payload.apnsToken = apnsToken;
      }

      if (Object.keys(payload).length === 0) {
        console.warn('No tokens provided to update');
        return null;
      }

      const response = await this.api.put<{
        success: boolean;
        data: RegisteredDevice;
        message: string;
      }>(`/devices/${this.deviceId}/tokens`, payload);

      if (response.data.success) {
        this.registeredDevices.set(this.deviceId, response.data.data);
        console.log('Notification tokens updated');
        return response.data.data;
      }

      return null;
    } catch (error) {
      console.error('Failed to update notification tokens:', error);
      throw error;
    }
  }

  /**
   * Deactivate current device
   */
  async deactivateDevice(): Promise<void> {
    try {
      await this.api.post(`/devices/${this.deviceId}/deactivate`, {});
      this.registeredDevices.delete(this.deviceId);
      console.log('Device deactivated');
    } catch (error) {
      console.error('Failed to deactivate device:', error);
      throw error;
    }
  }

  /**
   * Delete device from account
   */
  async deleteDevice(): Promise<void> {
    try {
      await this.api.delete(`/devices/${this.deviceId}`);
      this.registeredDevices.delete(this.deviceId);
      console.log('Device deleted');
    } catch (error) {
      console.error('Failed to delete device:', error);
      throw error;
    }
  }

  /**
   * Get current device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Check if user has multiple active devices
   */
  async hasMultipleDevices(): Promise<boolean> {
    try {
      const devices = await this.getDevices();
      return devices.filter((d) => d.isActive).length > 1;
    } catch {
      return false;
    }
  }

  /**
   * Get other active devices (excluding current device)
   */
  async getOtherActiveDevices(): Promise<RegisteredDevice[]> {
    try {
      const devices = await this.getDevices();
      return devices.filter((d) => d.isActive && d.deviceId !== this.deviceId);
    } catch {
      return [];
    }
  }
}

// Export singleton instance
export const deviceManager = new DeviceManager();

export type { RegisteredDevice, DeviceRegistrationData };
