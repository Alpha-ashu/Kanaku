/**
 * Biometric unlock (Face ID / Touch ID / Android fingerprint & face).
 *
 * SECURITY MODEL — read before changing anything here.
 *
 * Biometrics do NOT bypass the PIN. They unlock a copy of the PIN held in the
 * platform's hardware-backed secure store (iOS Keychain / Android Keystore), and
 * that PIN is then fed through the *existing* unlock path in PINAuth:
 *
 *     biometric prompt → getCredentials() → pinService.verifyPin({ pin })
 *                                         → verifyPIN(pin) → encryption key
 *
 * So the server-side PIN check still runs, and the local encryption key is still
 * derived from the PIN. Biometrics replace *typing*, not *verification*. If the
 * secure store is wiped (new device, biometric re-enrolment, app reinstall) the
 * user simply falls back to entering the PIN.
 *
 * The credential is stored only after a PIN has been verified successfully, and it
 * is deleted on logout, on PIN change, and whenever the user turns the feature off.
 */

import { Capacitor } from '@capacitor/core';
import { AccessControl, BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';

/** Namespace for the Keychain/Keystore entry. Must stay stable across releases. */
const CREDENTIAL_SERVER = 'com.kanaku.app.biometric';

/**
 * The PIN is stored hardware-protected, NOT as a plain Keychain/Keystore item.
 *
 * The plugin defaults to AccessControl.NONE, which stores credentials readable
 * without any authentication — unacceptable for a PIN that unlocks financial data.
 * BIOMETRY_CURRENT_SET binds the credential to the biometric set enrolled at the
 * time it was stored, so it is destroyed if someone later adds their own
 * fingerprint/face to a device they have gained access to.
 *
 * The trade-off is that a legitimate biometric re-enrolment also invalidates it.
 * That is handled gracefully: the read fails, we turn the feature off, and the user
 * falls back to typing their PIN and can re-enable in Settings.
 */
const ACCESS_CONTROL = AccessControl.BIOMETRY_CURRENT_SET;
/** Opt-in flag. Absence means "never enabled", which is the default. */
const BIOMETRIC_ENABLED_KEY = 'KANAKU_biometric_enabled';
/**
 * Set after a failed unlock so we do not re-prompt in a loop on the same screen.
 * Session-scoped: a fresh app launch always offers biometrics again.
 */
const BIOMETRIC_SUPPRESSED_KEY = 'KANAKU_biometric_suppressed';
/**
 * Set when the user declines the "turn on biometric unlock?" offer, so we stop
 * asking after every unlock. Cleared from Settings, which is how they opt back in.
 */
const BIOMETRIC_OFFER_DISMISSED_KEY = 'KANAKU_biometric_offer_dismissed';

export interface BiometricAvailability {
  /** Hardware present, enrolled, and usable right now. */
  available: boolean;
  /** What the device actually offers, for labelling the button correctly. */
  biometryType: BiometryType;
  /** Human-readable label: "Face ID", "Touch ID", "Fingerprint", "Biometrics". */
  label: string;
  /**
   * True for face-based modalities. Lets the UI pick a face vs fingerprint icon
   * without importing the plugin's enum into component code.
   */
  isFace: boolean;
  /** Populated when unavailable, for diagnostics only — never shown raw to users. */
  reason?: string;
}

const UNAVAILABLE: BiometricAvailability = {
  available: false,
  biometryType: BiometryType.NONE,
  label: 'Biometrics',
  isFace: false,
  reason: 'not-a-native-platform',
};

const isFaceModality = (biometryType: BiometryType): boolean =>
  biometryType === BiometryType.FACE_ID || biometryType === BiometryType.FACE_AUTHENTICATION;

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Maps the plugin's enum to the name the platform's own UI uses. */
const labelFor = (biometryType: BiometryType): string => {
  switch (biometryType) {
    case BiometryType.FACE_ID:
      return 'Face ID';
    case BiometryType.TOUCH_ID:
      return 'Touch ID';
    case BiometryType.FINGERPRINT:
      return 'Fingerprint';
    case BiometryType.FACE_AUTHENTICATION:
      return 'Face Unlock';
    case BiometryType.IRIS_AUTHENTICATION:
      return 'Iris Unlock';
    default:
      return 'Biometrics';
  }
};

/**
 * Whether this device can do biometrics at all. Safe on web (returns unavailable)
 * and never throws — callers use it to decide whether to render the button.
 */
export const getBiometricAvailability = async (): Promise<BiometricAvailability> => {
  if (!isNative()) return UNAVAILABLE;

  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    const biometryType = result.biometryType ?? BiometryType.NONE;
    return {
      available: Boolean(result.isAvailable),
      biometryType,
      label: labelFor(biometryType),
      isFace: isFaceModality(biometryType),
      reason: result.isAvailable ? undefined : String(result.errorCode ?? 'unavailable'),
    };
  } catch (error) {
    return {
      ...UNAVAILABLE,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Has the user opted in AND is there a stored credential to unlock? */
export const isBiometricEnabled = (): boolean => {
  try {
    return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
};

const setEnabledFlag = (enabled: boolean) => {
  try {
    if (enabled) localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
    else localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    /* storage unavailable — feature simply stays off */
  }
};

/** Suppressed for this session after a cancel/failure, so we stop auto-prompting. */
export const isBiometricSuppressed = (): boolean => {
  try {
    return sessionStorage.getItem(BIOMETRIC_SUPPRESSED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const suppressBiometricForSession = () => {
  try {
    sessionStorage.setItem(BIOMETRIC_SUPPRESSED_KEY, 'true');
  } catch {
    /* ignore */
  }
};

export const clearBiometricSuppression = () => {
  try {
    sessionStorage.removeItem(BIOMETRIC_SUPPRESSED_KEY);
  } catch {
    /* ignore */
  }
};

/** Has the user said "not now" to the enrolment offer? */
export const isBiometricOfferDismissed = (): boolean => {
  try {
    return localStorage.getItem(BIOMETRIC_OFFER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const dismissBiometricOffer = () => {
  try {
    localStorage.setItem(BIOMETRIC_OFFER_DISMISSED_KEY, 'true');
  } catch {
    /* ignore */
  }
};

/** Re-arms the offer so the next unlock asks again. Used by the Settings toggle. */
export const restoreBiometricOffer = () => {
  try {
    localStorage.removeItem(BIOMETRIC_OFFER_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Turns the feature on by writing the (already-verified) PIN into the hardware
 * secure store. Only call this immediately after the PIN has been verified —
 * never with a PIN the user merely typed.
 */
export const enableBiometricUnlock = async (
  verifiedPin: string,
  accountLabel: string,
): Promise<{ ok: boolean; message?: string }> => {
  if (!isNative()) {
    return { ok: false, message: 'Biometric unlock is only available in the mobile app.' };
  }

  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return {
      ok: false,
      message: `${availability.label} is not set up on this device. Add it in your device settings first.`,
    };
  }

  try {
    // Storing with an accessControl level is itself biometric-gated on both
    // platforms, so this single call both proves identity and binds the credential.
    // No separate verifyIdentity() — that would prompt the user twice.
    await NativeBiometric.setCredentials({
      username: accountLabel,
      password: verifiedPin,
      server: CREDENTIAL_SERVER,
      accessControl: ACCESS_CONTROL,
    });

    setEnabledFlag(true);
    clearBiometricSuppression();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A user-cancelled prompt is not an error worth shouting about.
    if (/cancel/i.test(message)) {
      return { ok: false, message: undefined };
    }
    console.warn('[Biometric] Enrolment failed:', message);
    return { ok: false, message: 'Could not enable biometric unlock. Please try again.' };
  }
};

/** Turns the feature off and destroys the stored credential. Safe to call anytime. */
export const disableBiometricUnlock = async (): Promise<void> => {
  setEnabledFlag(false);
  clearBiometricSuppression();

  if (!isNative()) return;

  try {
    await NativeBiometric.deleteCredentials({ server: CREDENTIAL_SERVER });
  } catch {
    // Nothing stored, or the store is unavailable — the flag is off either way.
  }
};

export type BiometricUnlockOutcome =
  | { status: 'success'; pin: string }
  | { status: 'cancelled' }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

/**
 * Prompts for biometrics and returns the stored PIN so the caller can run it
 * through the normal verification path.
 *
 * The PIN is returned in memory only — never log it, never persist it anywhere
 * other than the secure store it came from.
 */
export const unlockWithBiometrics = async (): Promise<BiometricUnlockOutcome> => {
  if (!isNative()) {
    return { status: 'unavailable', message: 'Biometric unlock is only available in the mobile app.' };
  }
  if (!isBiometricEnabled()) {
    return { status: 'unavailable', message: 'Biometric unlock is not enabled.' };
  }

  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return {
      status: 'unavailable',
      message: `${availability.label} is unavailable right now. Enter your PIN instead.`,
    };
  }

  try {
    // getSecureCredentials shows the prompt itself, bound to the credential's
    // decryption key (CryptoObject on Android, SecAccessControl on iOS). One prompt,
    // and there is no code path that can read the PIN without it.
    const credentials = await NativeBiometric.getSecureCredentials({
      server: CREDENTIAL_SERVER,
      reason: 'Unlock KANAKU',
      title: 'Unlock KANAKU',
      subtitle: `Use ${availability.label} to continue`,
    });

    if (!credentials?.password) {
      // Flag says enrolled but the store is empty — self-heal rather than leave the
      // user staring at a button that can never work.
      await disableBiometricUnlock();
      return {
        status: 'unavailable',
        message: 'Biometric unlock needs to be set up again. Enter your PIN to continue.',
      };
    }

    return { status: 'success', pin: credentials.password };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/cancel/i.test(message)) {
      return { status: 'cancelled' };
    }

    // A biometric re-enrolment invalidates a BIOMETRY_CURRENT_SET credential by
    // design. That is not a failure to report as "did not match" — the stored PIN is
    // simply gone, so turn the feature off and let the user re-enable it.
    if (/invalidat|key|permanently|not found|no credentials/i.test(message)) {
      console.info('[Biometric] Stored credential invalidated, disabling:', message);
      await disableBiometricUnlock();
      return {
        status: 'unavailable',
        message: 'Your biometrics changed, so biometric unlock was reset. Enter your PIN to continue.',
      };
    }

    return {
      status: 'failed',
      message: `${availability.label} did not match. Enter your PIN instead.`,
    };
  }
};

/**
 * Keeps the stored credential in step with a PIN change. Called by the PIN-change
 * flow — without this, biometrics would keep unlocking with the old PIN and then
 * fail server verification.
 */
export const syncBiometricPin = async (newPin: string, accountLabel: string): Promise<void> => {
  if (!isNative() || !isBiometricEnabled()) return;

  try {
    await NativeBiometric.setCredentials({
      username: accountLabel,
      password: newPin,
      server: CREDENTIAL_SERVER,
      accessControl: ACCESS_CONTROL,
    });
  } catch (error) {
    // If we cannot re-bind, disable rather than leave a stale PIN behind.
    console.warn('[Biometric] Could not update stored PIN, disabling:', error);
    await disableBiometricUnlock();
  }
};
