// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { clearPinUnlockToken } = vi.hoisted(() => ({
  clearPinUnlockToken: vi.fn(),
}));

vi.mock('@/lib/pinUnlockCoordinator', () => ({ clearPinUnlockToken }));
vi.mock('@/lib/encryption', () => ({
  clearSecurityData: vi.fn(),
  backupPINKeys: vi.fn(),
  restorePINKeys: vi.fn(),
}));

import { SecurityProvider, useSecurity } from '@/contexts/SecurityContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeStorage = () => {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
};

type Security = ReturnType<typeof useSecurity>;

describe('SecurityProvider lock state', () => {
  let local: ReturnType<typeof makeStorage>;
  let session: ReturnType<typeof makeStorage>;
  let container: HTMLDivElement;
  let root: Root;
  let security: Security;

  const Probe = () => {
    security = useSecurity();
    return null;
  };

  const mount = () => {
    act(() => {
      root.render(
        <SecurityProvider>
          <Probe />
        </SecurityProvider>
      );
    });
  };

  beforeEach(() => {
    local = makeStorage();
    session = makeStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('does not restore an unlocked session from a persistent localStorage flag', () => {
    // Legacy builds wrote session_active to localStorage, which survived closing
    // the browser and skipped the PIN screen forever.
    local.setItem('session_active', 'true');
    local.setItem('session_encryption_key', '123456');

    mount();

    expect(security.isAuthenticated).toBe(false);
    expect(security.encryptionKey).toBeNull();
  });

  it('stays unlocked across a same-tab reload via sessionStorage', () => {
    session.setItem('session_active', 'true');
    session.setItem('session_encryption_key', '123456');

    mount();

    expect(security.isAuthenticated).toBe(true);
    expect(security.encryptionKey).toBe('123456');
  });

  it('persists an unlock to sessionStorage only and drops legacy localStorage keys', () => {
    local.setItem('session_active', 'true');
    mount();

    act(() => security.setAuthenticated('654321'));

    expect(security.isAuthenticated).toBe(true);
    expect(session.getItem('session_active')).toBe('true');
    expect(session.getItem('session_encryption_key')).toBe('654321');
    expect(local.getItem('session_active')).toBeNull();
    expect(local.getItem('session_encryption_key')).toBeNull();
  });

  it('lock() clears every unlock trace and notifies the app', () => {
    mount();
    act(() => security.setAuthenticated('654321'));
    local.setItem('session_active', 'true');
    const onLocked = vi.fn();
    window.addEventListener('KANAKU_PIN_LOCKED', onLocked);

    act(() => security.lock());

    window.removeEventListener('KANAKU_PIN_LOCKED', onLocked);
    expect(security.isAuthenticated).toBe(false);
    expect(security.encryptionKey).toBeNull();
    expect(session.getItem('session_active')).toBeNull();
    expect(session.getItem('session_encryption_key')).toBeNull();
    expect(local.getItem('session_active')).toBeNull();
    expect(clearPinUnlockToken).toHaveBeenCalled();
    expect(onLocked).toHaveBeenCalledTimes(1);
  });

  it.each(['KANAKU_FORCE_PIN_LOCK', 'KANAKU_SESSION_EXPIRED'])(
    '%s locks and clears legacy localStorage keys',
    (eventName) => {
      mount();
      act(() => security.setAuthenticated('654321'));
      local.setItem('session_active', 'true');
      local.setItem('session_encryption_key', '654321');

      act(() => {
        window.dispatchEvent(new CustomEvent(eventName));
      });

      expect(security.isAuthenticated).toBe(false);
      expect(session.getItem('session_active')).toBeNull();
      expect(local.getItem('session_active')).toBeNull();
      expect(local.getItem('session_encryption_key')).toBeNull();
    }
  );
});
