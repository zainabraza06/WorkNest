import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerWakeNotice, WakeCard } from '@/components/layout/ServerWakeNotice';
import { isServerReady, useServerWake } from './useServerWake';

const ok = (body = { status: 'ready' }) => ({ ok: true, json: async () => body });

describe('isServerReady', () => {
  it('is true only for a JSON body that says ready', async () => {
    expect(await isServerReady(async () => ok())).toBe(true);
    expect(await isServerReady(async () => ok({ status: 'draining' }))).toBe(false);
  });

  it('treats errors, bad status codes and non-JSON interstitials as "not up yet"', async () => {
    expect(await isServerReady(async () => { throw new TypeError('Failed to fetch'); })).toBe(false); // no-CORS wake page
    expect(await isServerReady(async () => ({ ok: false, json: async () => ({}) }))).toBe(false);
    expect(await isServerReady(async () => ({ ok: true, json: async () => { throw new SyntaxError('<html>'); } }))).toBe(false);
  });
});

describe('useServerWake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('stays silent when the server answers straight away', async () => {
    const fetchImpl = vi.fn(async () => ok());
    const { result } = renderHook(() => useServerWake({ fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.status).toBe('awake');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.status).toBe('awake'); // never flashed "waking"
  });

  it('announces the wake-up when there is no answer, then says ready once it answers', async () => {
    let up = false;
    const fetchImpl = vi.fn(async () => {
      if (!up) throw new TypeError('Failed to fetch');
      return ok();
    });
    const { result } = renderHook(() => useServerWake({ fetchImpl, graceMs: 1500, retryMs: 3000 }));

    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(result.current.status).toBe('waking');

    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(result.current.status).toBe('waking');
    expect(result.current.elapsed).toBeGreaterThanOrEqual(9);

    up = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
    expect(result.current.status).toBe('ready');
  });

  it('does not interrupt a visitor who chose to browse while waiting', async () => {
    let up = false;
    const fetchImpl = vi.fn(async () => (up ? ok() : Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useServerWake({ fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(result.current.status).toBe('waking');

    act(() => result.current.dismiss());
    expect(result.current.status).toBe('awake');

    up = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(result.current.status).toBe('awake'); // no "ready" popup after they carried on
  });

  it('gives up after a long silence and can be retried', async () => {
    let up = false;
    const fetchImpl = vi.fn(async () => (up ? ok() : Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useServerWake({ fetchImpl, giveUpMs: 10_000, retryMs: 3000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.status).toBe('failed');

    up = true;
    act(() => result.current.retry());
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.status).toBe('ready');
  });

  it('skips the check when the server answered a few minutes ago in this tab', async () => {
    window.sessionStorage.setItem('wn-server-awake-at', String(Date.now() - 2 * 60 * 1000));
    const fetchImpl = vi.fn(async () => ok());
    const { result } = renderHook(() => useServerWake({ fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.status).toBe('awake');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks again once the remembered answer is older than the idle window', async () => {
    window.sessionStorage.setItem('wn-server-awake-at', String(Date.now() - 20 * 60 * 1000));
    const fetchImpl = vi.fn(async () => ok());
    renderHook(() => useServerWake({ fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('WakeCard', () => {
  const noop = () => {};

  it('renders nothing while checking or awake', () => {
    const { container, rerender } = render(<WakeCard status="checking" elapsed={0} dismiss={noop} retry={noop} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<WakeCard status="awake" elapsed={0} dismiss={noop} retry={noop} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains the wait and shows the running timer', () => {
    render(<WakeCard status="waking" elapsed={12} dismiss={noop} retry={noop} />);
    expect(screen.getByRole('status')).toHaveTextContent(/server is waking up/i);
    expect(screen.getByText(/free tier on render · 12s/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse while waiting/i })).toBeInTheDocument();
  });

  it('says to continue working once the server is up, and the button dismisses it', () => {
    const dismiss = vi.fn();
    render(<WakeCard status="ready" elapsed={34} dismiss={dismiss} retry={noop} />);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/server is up/i);
    expect(screen.getByText(/you can continue working/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /continue/i });
    expect(btn).toHaveFocus(); // Enter is enough for keyboard users
    fireEvent.click(btn);
    expect(dismiss).toHaveBeenCalled();
  });

  it('offers a retry when the server never answered', () => {
    const retry = vi.fn();
    render(<WakeCard status="failed" elapsed={180} dismiss={noop} retry={retry} />);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/still can.t reach the server/i);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('ServerWakeNotice (wired to the hook)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows nothing when the API is already awake', async () => {
    const { container } = render(<ServerWakeNotice />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(container).toBeEmptyDOMElement();
  });
});
