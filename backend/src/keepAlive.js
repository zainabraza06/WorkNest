/**
 * Self keep-alive for hosts that put idle services to sleep (Render's free tier sleeps a web
 * service after ~15 minutes without inbound traffic, and the next request waits 30 to 50 s).
 *
 * While the service is awake it calls its own public URL, and the AI service, on a timer.
 * That is real inbound traffic through the platform's proxy, so the idle clock keeps resetting.
 * It cannot wake a service that is already asleep (a sleeping process runs no timers); that is
 * what an external pinger or the first visitor is for.
 *
 * Off unless KEEP_ALIVE=true. Mind the free-tier budget: Render gives a workspace 750 free
 * instance-hours a month. One service awake all day is 720 h; two is 1,440 h and runs the
 * budget out around day 15. KEEP_ALIVE_HOURS (e.g. "7-23") limits pinging to a daily window so
 * the service can sleep the rest of the time.
 */

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

/** "7-23" -> { start: 7, end: 23 } (end exclusive; wraps past midnight, e.g. "22-6"). */
export function parseWindow(spec) {
  if (!spec) return null;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(spec).trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start > 24 || end > 24 || start === end) return null;
  return { start, end };
}

/** The wall-clock hour (0-23) in the given IANA time zone. */
export function hourIn(timeZone, date = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(date);
  return Number(h) % 24;
}

export function withinWindow(window, timeZone, date = new Date()) {
  if (!window) return true; // no window = always
  const h = hourIn(timeZone, date);
  return window.start < window.end ? h >= window.start && h < window.end : h >= window.start || h < window.end;
}

/** Which URLs to hit. Local addresses are skipped: pinging localhost keeps nothing awake. */
export function buildTargets({ externalUrl, aiUrl, aiEnabled, extra = [] }) {
  const targets = [];
  if (externalUrl) targets.push(`${externalUrl.replace(/\/$/, '')}/api/health/live`);
  if (aiEnabled && aiUrl && !LOCAL.test(aiUrl)) targets.push(`${aiUrl.replace(/\/$/, '')}/health`);
  for (const u of extra) if (u && !LOCAL.test(u)) targets.push(u);
  return [...new Set(targets)];
}

/** One round of pings. Never throws: a failed ping is a log line, not an incident. */
export async function pingOnce({ targets, fetchImpl = fetch, log, timeoutMs = 60_000 }) {
  const results = await Promise.allSettled(
    targets.map(async (url) => {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'worknest-keepalive' } });
      return { url, status: res.status };
    }),
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') log?.debug?.({ url: r.value.url, status: r.value.status }, 'keep-alive ping');
    else log?.warn?.({ url: targets[i], err: r.reason?.message }, 'keep-alive ping failed');
  });
  return results;
}

/**
 * Starts the timer. Returns a stop() function, or a no-op when disabled or there is nothing to
 * ping. The timer is unref'd so it never keeps the process alive on its own.
 */
export function startKeepAlive({ env, log, fetchImpl = fetch, now = () => new Date() }) {
  if (!env.KEEP_ALIVE) return () => {};

  const targets = buildTargets({
    externalUrl: env.RENDER_EXTERNAL_URL,
    aiUrl: env.AI_SERVICE_URL,
    aiEnabled: env.AI_ENABLED,
    extra: (env.KEEP_ALIVE_URLS ?? '').split(',').map((s) => s.trim()),
  });
  if (targets.length === 0) {
    log?.warn?.('KEEP_ALIVE is on but there is nothing to ping (RENDER_EXTERNAL_URL is unset and the AI service is local)');
    return () => {};
  }

  const window = parseWindow(env.KEEP_ALIVE_HOURS);
  if (env.KEEP_ALIVE_HOURS && !window) log?.warn?.({ KEEP_ALIVE_HOURS: env.KEEP_ALIVE_HOURS }, 'ignoring invalid KEEP_ALIVE_HOURS (expected "7-23")');
  const tz = env.KEEP_ALIVE_TZ || 'Asia/Karachi';
  const everyMs = (env.KEEP_ALIVE_INTERVAL_SEC ?? 600) * 1000;

  const tick = () => {
    if (!withinWindow(window, tz, now())) return;
    void pingOnce({ targets, fetchImpl, log });
  };

  log?.info?.({ targets, everySec: everyMs / 1000, window: env.KEEP_ALIVE_HOURS || 'always', tz }, 'keep-alive enabled');
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
