// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAvatar, getInitials } from '@/app/components/ui/UserAvatar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('UserAvatar Component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  it('correctly calculates initials from names', () => {
    expect(getInitials('Shaik Ashraf')).toBe('SA');
    expect(getInitials('Ashraf')).toBe('AS');
    expect(getInitials('A')).toBe('A');
    expect(getInitials('')).toBe('U');
  });

  it('renders an image when avatarUrl is provided', () => {
    act(() => {
      root.render(
        <UserAvatar
          avatarUrl="https://example.com/avatar.png"
          name="Shaik Ashraf"
          size="md"
        />
      );
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/avatar.png');
    expect(img?.getAttribute('alt')).toBe('Shaik Ashraf');
  });

  it('renders initials when avatarUrl is not provided', () => {
    act(() => {
      root.render(
        <UserAvatar
          avatarUrl={null}
          name="Shaik Ashraf"
          size="md"
        />
      );
    });

    const img = container.querySelector('img');
    expect(img).toBeNull();
    expect(container.textContent).toContain('SA');
  });

  it('falls back to initials when the image errors', () => {
    act(() => {
      root.render(
        <UserAvatar
          avatarUrl="https://example.com/broken.png"
          name="Shaik Ashraf"
          size="md"
        />
      );
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    // Trigger error
    act(() => {
      img?.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('SA');
  });

  it('updates dynamically on custom event', () => {
    act(() => {
      root.render(
        <UserAvatar
          name="Shaik Ashraf"
          size="md"
        />
      );
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('SA');

    // Simulate profile update event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('KANAKU_PROFILE_UPDATED', {
          detail: { avatar_url: 'https://example.com/updated.png' },
        })
      );
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/updated.png');
  });
});
