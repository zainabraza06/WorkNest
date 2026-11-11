import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTargets, parseWindow, pingOnce, startKeepAlive, withinWindow } from '../src/keepAlive.js';

const at = (iso) => new Date(iso);

describe('parseWindow', () => {
  it('parses start-end hours', () => {
    expect(parseWindow('7-23')).toEqual({ start: 7, end: 23 });
    expect(parseWindow(' 22-6 ')).toEqual({ start: 22, end: 6 });
  });

  it('rejects anything that is not a usable window', () => {
    for (const bad of [undefined, '', 'always', '7', '7-7', '25-3', '7-30', '7:00-23:00']) {
      expect(parseWindow(bad)).toBeNull();
    }
  });
});

describe('withinWindow', () => {
  it('no window means always on', () => {
    expect(withinWindow(null, 'UTC', at('2026-01-01T03:00:00Z'))).toBe(true);
  });

  it('uses the configured time zone, not the server clock', () => {
    // 03:00 UTC is 08:00 in Karachi (UTC+5)
    const w = { start: 7, end: 23 };
    expect(withinWindow(w, 'Asia/Karachi', at('2026-01-01T03:00:00Z'))).toBe(true);
    expect(withinWindow(w, 'UTC', at('2026-01-01T03:00:00Z'))).toBe(false);
  });

  it('treats the end hour as exclusive', () => {
    const w = { start: 7, end: 23 };
    expect(withinWindow(w, 'UTC', at('2026-01-01T22:59:00Z'))).toBe(true);
    expect(withinWindow(w, 'UTC', at('2026-01-01T23:00:00Z'))).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    const w = { start: 22, end: 6 };
    expect(withinWindow(w, 'UTC', at('2026-01-01T23:30:00Z'))).toBe(true);
    expect(withinWindow(w, 'UTC', at('2026-01-01T02:00:00Z'))).toBe(true);
    expect(withinWindow(w, 'UTC', at('2026-01-01T12:00:00Z'))).toBe(false);
  });
});

describe('buildTargets', () => {
  it('pings the public URL and a remote AI service', () => {
    expect(buildTargets({ externalUrl: 'https://api.example.com/', aiUrl: 'https://ai.example.com', aiEnabled: true })).toEqual([
      'https://api.example.com/api/health/live',
      'https://ai.example.com/health',
    ]);
  });

  it('skips local addresses and a disabled AI service', () => {
    expect(buildTargets({ aiUrl: 'http://localhost:8000', aiEnabled: true, extra: ['http://127.0.0.1:3000'] })).toEqual([]);
    expect(buildTargets({ aiUrl: 'https://ai.example.com', aiEnabled: false })).toEqual([]);
  });

  it('de-duplicates and accepts extra URLs', () => {
    const t = buildTargets({ externalUrl: 'https://a.example.com', aiEnabled: false, extra: ['https://x.example.com/up', 'https://x.example.com/up', ''] });
    expect(t).toEqual(['https://a.example.com/api/health/live', 'https://x.example.com/up']);
  });
});

describe('pingOnce', () => {
  it('hits every target and never throws when one fails', async () => {
    const log = { debug: vi.fn(), warn: vi.fn() };
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('bad')) throw new Error('connection refused');
      return { status: 200 };
    });
    const results = await pingOnce({ targets: ['https://ok.example.com', 'https://bad.example.com'], fetchImpl, log });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(log.warn).toHaveBeenCalledOnce();
  });
});

describe('startKeepAlive', () => {
  afterEach(() => vi.useRealTimers());

  const base = { KEEP_ALIVE: true, RENDER_EXTERNAL_URL: 'https://api.example.com', AI_SERVICE_URL: 'https://ai.example.com', AI_ENABLED: true, KEEP_ALIVE_INTERVAL_SEC: 600 };

  it('does nothing when disabled', () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn();
    const stop = startKeepAlive({ env: { ...base, KEEP_ALIVE: false }, fetchImpl });
    vi.advanceTimersByTime(3_600_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    stop();
  });

  it('pings on the interval and stops when asked', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const stop = startKeepAlive({ env: base, fetchImpl, log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() } });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // API + AI
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('stays quiet outside the daily window', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const stop = startKeepAlive({
      env: { ...base, KEEP_ALIVE_HOURS: '7-23', KEEP_ALIVE_TZ: 'UTC' },
      fetchImpl,
      now: () => at('2026-01-01T03:00:00Z'), // 03:00 UTC, outside 7-23
      log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    });
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    stop();
  });

  it('warns and does nothing when there is nowhere useful to ping', () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const stop = startKeepAlive({ env: { KEEP_ALIVE: true, AI_SERVICE_URL: 'http://localhost:8000', AI_ENABLED: true }, log });
    expect(log.warn).toHaveBeenCalledOnce();
    stop();
  });
});
