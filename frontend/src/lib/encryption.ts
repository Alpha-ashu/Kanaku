import CryptoJS from 'crypto-js';

// Encryption key management
const STORAGE_KEY = 'KANAKU_encrypted_key';
const SALT_KEY = 'KANAKU_salt';

/**
 * Call this BEFORE localStorage.clear() during signout.
 * Returns the PIN keys and global settings that must survive the clear.
 */
export const backupPINKeys = (): { hash: string | null; salt: string | null; adminSettings: string | null } => ({
  hash: localStorage.getItem(STORAGE_KEY),
  salt: localStorage.getItem(SALT_KEY),
  adminSettings: localStorage.getItem('admin_global_feature_settings'),
});

/**
 * Call this AFTER localStorage.clear() during signout.
 * Restores the PIN keys and global settings so they survive logout.
 */
export const restorePINKeys = (backup: { hash: string | null; salt: string | null; adminSettings?: string | null }): void => {
  if (backup.hash) localStorage.setItem(STORAGE_KEY, backup.hash);
  if (backup.salt) localStorage.setItem(SALT_KEY, backup.salt);
  if (backup.adminSettings) localStorage.setItem('admin_global_feature_settings', backup.adminSettings);
};

/**
 * Change PIN - verifies old PIN first, then stores the new one.
 * Returns true on success, false if oldPin is wrong.
 */
export const changePIN = async (oldPin: string, newPin: string): Promise<boolean> => {
  const { isValid } = await verifyPIN(oldPin);
  if (!isValid) return false;
  await storeMasterKey(newPin);
  return true;
};

/**
 * Generate encryption key from PIN
 */
export const generateKeyFromPIN = async (pin: string, salt?: string): Promise<string> => {
  const useSalt = salt || CryptoJS.lib.WordArray.random(128 / 8).toString();

  if (!salt) {
    // Store salt for future use
    localStorage.setItem(SALT_KEY, useSalt);
  }

  // Use Web Crypto API to derive key asynchronously in a background thread, preventing UI blocking/jank.
  try {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);
    
    // Convert hex salt to Uint8Array
    const saltBytes = new Uint8Array(
      useSalt.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      pinBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 10000,
        hash: 'SHA-1', // CryptoJS PBKDF2 default is SHA-1
      },
      baseKey,
      256
    );

    // Convert derived bits to hex string
    return Array.from(new Uint8Array(derivedBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    console.warn('Web Crypto PBKDF2 failed, falling back to CryptoJS:', e);
    // Fallback to CryptoJS if Web Crypto is unsupported
    const key = CryptoJS.PBKDF2(pin, useSalt, {
      keySize: 256 / 32,
      iterations: 10000,
    });
    return key.toString();
  }
};

/**
 * Encrypt data
 */
export const encryptData = (data: any, key: string): string => {
  const jsonString = JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(jsonString, key);
  return encrypted.toString();
};

/**
 * Decrypt data
 */
export const decryptData = (encryptedData: string, key: string): any => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
};

/**
 * Hash PIN for verification
 */
export const hashPIN = (pin: string): string => {
  return CryptoJS.SHA256(pin).toString();
};

/**
 * Store encrypted master key
 */
export const storeMasterKey = async (pin: string): Promise<string> => {
  const salt = localStorage.getItem(SALT_KEY) || CryptoJS.lib.WordArray.random(128 / 8).toString();
  localStorage.setItem(SALT_KEY, salt);

  const key = await generateKeyFromPIN(pin, salt);
  const hashedPIN = hashPIN(pin);

  localStorage.setItem(STORAGE_KEY, hashedPIN);
  return key;
};

/**
 * Verify PIN and return encryption key
 */
export const verifyPIN = async (pin: string): Promise<{ isValid: boolean; key?: string }> => {
  const storedHash = localStorage.getItem(STORAGE_KEY);
  const salt = localStorage.getItem(SALT_KEY);

  if (!storedHash) {
    return { isValid: false };
  }

  const hashedPIN = hashPIN(pin);

  if (hashedPIN === storedHash && salt) {
    const key = await generateKeyFromPIN(pin, salt);
    return { isValid: true, key };
  }

  return { isValid: false };
};

/**
 * Check if PIN is set
 */
export const isPINSet = (): boolean => {
  return !!localStorage.getItem(STORAGE_KEY);
};

/**
 * Clear all security data (logout/reset)
 */
export const clearSecurityData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SALT_KEY);
  sessionStorage.clear();
};

/**
 * Encrypt object for IndexedDB storage
 */
export const encryptForStorage = (obj: any, encryptionKey: string): any => {
  // Don't encrypt id and metadata fields
  const { id, createdAt, ...dataToEncrypt } = obj;

  const encrypted = encryptData(dataToEncrypt, encryptionKey);

  return {
    id,
    createdAt,
    encryptedData: encrypted,
    isEncrypted: true,
  };
};

/**
 * Decrypt object from IndexedDB storage
 */
export const decryptFromStorage = (obj: any, encryptionKey: string): any => {
  if (!obj.isEncrypted) {
    return obj; // Not encrypted, return as-is
  }

  const decrypted = decryptData(obj.encryptedData, encryptionKey);

  return {
    id: obj.id,
    createdAt: obj.createdAt,
    ...decrypted,
  };
};
