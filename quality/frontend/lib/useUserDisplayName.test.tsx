// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserDisplayName } from '@/hooks/useUserDisplayName';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock AuthContext
const mockUser = {
  id: 'test-user-id',
  email: 'mohammedsha27@gmail.com',
  user_metadata: {} as Record<string, any>,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    signOut: vi.fn(),
  })),
}));

// Mock api
vi.mock('@/lib/api', () => ({
  api: {
    auth: {
      getProfile: vi.fn().mockResolvedValue({
        success: true,
        data: {
          firstName: 'Shaik',
          lastName: 'Ashraf',
          name: 'Shaik Ashraf',
        },
      }),
    },
  },
}));

const DisplayNameViewer: React.FC = () => {
  const name = useUserDisplayName();
  return <div id="test-name">{name}</div>;
};

describe('useUserDisplayName hook', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockUser.user_metadata = {};
    mockUser.email = 'mohammedsha27@gmail.com';
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  it('reads first name from localStorage user_first_name directly', () => {
    localStorage.setItem('user_first_name', 'Shaik');
    act(() => {
      root.render(<DisplayNameViewer />);
    });
    expect(container.querySelector('#test-name')?.textContent).toBe('Shaik');
  });

  it('extracts first name from localStorage user_name', () => {
    localStorage.setItem('user_name', 'Shaik Ashraf');
    act(() => {
      root.render(<DisplayNameViewer />);
    });
    expect(container.querySelector('#test-name')?.textContent).toBe('Shaik');
  });

  it('reads first name from user_profile JSON', () => {
    localStorage.setItem(
      'user_profile',
      JSON.stringify({ firstName: 'Shaik', displayName: 'Shaik Ashraf' })
    );
    act(() => {
      root.render(<DisplayNameViewer />);
    });
    expect(container.querySelector('#test-name')?.textContent).toBe('Shaik');
  });

  it('extracts first name from user_metadata in auth context', async () => {
    mockUser.user_metadata = { first_name: 'Shaik' };
    await act(async () => {
      root.render(<DisplayNameViewer />);
    });
    expect(container.querySelector('#test-name')?.textContent).toBe('Shaik');
  });

  it('extracts name from decoded JWT token when local storage has token', async () => {
    const payload = btoa(JSON.stringify({ name: 'Shaik Ashraf', email: 'mohammedsha27@gmail.com' }));
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
    localStorage.setItem('auth_token', fakeJwt);

    await act(async () => {
      root.render(<DisplayNameViewer />);
    });
    expect(container.querySelector('#test-name')?.textContent).toBe('Shaik');
  });

  it('asynchronously fetches first name from api.auth.getProfile and updates cache', async () => {
    await act(async () => {
      root.render(<DisplayNameViewer />);
    });
    expect(container.querySelector('#test-name')?.textContent).toBe('Shaik');
    expect(localStorage.getItem('user_first_name')).toBe('Shaik');
  });

  it('never displays raw email username with trailing digits', async () => {
    mockUser.email = 'alexandra99@gmail.com';
    await act(async () => {
      root.render(<DisplayNameViewer />);
    });
    const text = container.querySelector('#test-name')?.textContent;
    expect(text).not.toBe('alexandra99');
    expect(text).not.toBe('Alexandra99');
  });
});
