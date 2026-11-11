import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Detects the "free-tier server is asleep" case and reports it to the UI.
 *
 * Render's free tier sleeps a web service after ~15 minutes without traffic; the first request
 * afterwards waits 30 to 50 seconds. Instead of leaving the visitor staring at skeletons we ask
 * the API's readiness endpoint as soon as the app loads:
 *
 *   awake    answered within `graceMs`: nothing to show
 *   waking   still no answer after `graceMs`: show "server is waking up" with a running timer
 *   ready    it answered after having been asleep: show "continue working"
 *   failed   still nothing after `giveUpMs`: offer a retry
 *
 * While the server is asleep the platform answers with an interstitial page that carries no CORS
 * headers, so the browser reports a network error. Every failure is therefore treated as "not up
 * yet" and retried, and a response only counts when it is JSON that says `status: "ready"`.
 */

const STORAGE_KEY = 'wn-server-awake-at';
// Render idles a service after 15 minutes; stay inside that when trusting an earlier answer
const FRESH_MS = 10 * 60 * 1000;

const readyUrl = () => `${import.meta.env.VITE_API_URL ?? ''}/api/health/ready`;

const recentlyAwake = () => {
  try {
    const at = Number(window.sessionStorage.getItem(STORAGE_KEY));
    return Boolean(at) && Date.now() - at < FRESH_MS;
  } catch {
    return false; // storage can be blocked; just check again
  }
};
const markAwake = () => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* non-fatal */
  }
};

export async function isServerReady(fetchImpl = fetch, url = readyUrl(), timeoutMs = 20_000) {
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === 'ready';
  } catch {
    return false;
  }
}

export function useServerWake({ graceMs = 1500, retryMs = 3000, giveUpMs = 180_000, fetchImpl } = {}) {
  const [status, setStatus] = useState(() => (recentlyAwake() ? 'awake' : 'checking'));
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0); // bump to start over (Retry button)
  const wasSlow = useRef(false);
  const dismissed = useRef(false); // the visitor chose to carry on; don't interrupt them later

  useEffect(() => {
    if (status === 'awake' && attempt === 0) return undefined; // trusted recent answer
    let cancelled = false;
    const startedAt = Date.now();
    // After "Try again" the visitor has already been told the server is down, so go straight back
    // to the waiting card and finish with a confirmation, rather than vanishing and staying silent
    const retrying = attempt > 0;
    wasSlow.current = retrying;
    dismissed.current = false;
    setElapsed(0);
    setStatus(retrying ? 'waking' : 'checking');

    // Only announce the wake-up if the answer is actually slow
    const graceTimer = setTimeout(() => {
      if (cancelled) return;
      wasSlow.current = true;
      setStatus((s) => (s === 'checking' ? 'waking' : s));
    }, graceMs);
    const clock = setInterval(() => !cancelled && setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);

    (async () => {
      while (!cancelled) {
        if (await isServerReady(fetchImpl)) {
          if (cancelled) return;
          markAwake();
          setStatus(wasSlow.current && !dismissed.current ? 'ready' : 'awake');
          return;
        }
        if (Date.now() - startedAt > giveUpMs) {
          if (!cancelled) setStatus('failed');
          return;
        }
        await new Promise((r) => setTimeout(r, retryMs));
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(graceTimer);
      clearInterval(clock);
    };
    // `status` is deliberately not a dependency: it is the output of this effect
  }, [attempt, graceMs, retryMs, giveUpMs, fetchImpl]);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    setStatus('awake');
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, elapsed, dismiss, retry };
}
