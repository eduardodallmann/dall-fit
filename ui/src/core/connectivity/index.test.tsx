import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isBrowserOnline,
  refreshConnectivity,
  useConnectivity,
} from '~/core/connectivity';

describe('connectivity source', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes browser online and offline changes', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useConnectivity());

    expect(result.current).toBe(true);

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('rereads the browser snapshot on an explicit refresh', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useConnectivity());

    online.mockReturnValue(true);
    act(() => refreshConnectivity());

    expect(result.current).toBe(true);
    expect(isBrowserOnline()).toBe(true);
  });
});
