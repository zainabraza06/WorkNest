import { useEffect, useRef } from 'react';
import { CheckCircle2, ServerOff } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useServerWake } from '@/hooks/useServerWake';
import { LogoMark } from './Logo';

/**
 * Tells the visitor what is happening when the free-tier API is asleep.
 *
 * Render sleeps an idle free service and the first request afterwards takes 30 to 50 seconds. If
 * the server answers quickly this renders nothing at all. If not, it explains the wait with a live
 * timer, and when the server is up it says so and lets the visitor carry on.
 */
export function ServerWakeNotice() {
  return <WakeCard {...useServerWake()} />;
}

/** The card itself, driven by plain props so every state can be rendered in a test. */
export function WakeCard({ status, elapsed, dismiss, retry }) {
  const continueRef = useRef(null);

  // Move focus to the action when the server comes up, so keyboard users can just press Enter
  useEffect(() => {
    if (status === 'ready') continueRef.current?.focus();
  }, [status]);

  if (status !== 'waking' && status !== 'ready' && status !== 'failed') return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-ink-950/60 p-4 backdrop-blur-[2px] sm:items-center">
      <div
        role={status === 'waking' ? 'status' : 'alertdialog'}
        aria-live="polite"
        aria-modal={status !== 'waking'}
        aria-labelledby="wake-title"
        className="w-full max-w-md animate-rise rounded-xl border border-ink-200 bg-white p-6 shadow-raised"
      >
        {status === 'waking' && (
          <>
            <div className="flex items-center gap-3">
              <LogoMark animated className="size-10 rounded-xl" />
              <div>
                <h2 id="wake-title" className="font-display text-lg font-extrabold tracking-tight text-ink-950">
                  Server is waking up
                </h2>
                <p className="text-sm text-ink-600">Free tier on Render · {elapsed}s</p>
              </div>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
              <div className="h-full w-1/3 animate-wake-bar rounded-full bg-primary-500" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-600">
              WorkNest runs on a free server that sleeps after 15 minutes without visitors. Starting it again takes about 30 to
              50 seconds, only after a quiet spell. We&apos;ll tell you the moment it&apos;s ready.
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Browse while waiting
              </Button>
            </div>
          </>
        )}

        {status === 'ready' && (
          <>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-10 text-success-600" aria-hidden />
              <div>
                <h2 id="wake-title" className="font-display text-lg font-extrabold tracking-tight text-ink-950">
                  Server is up
                </h2>
                <p className="text-sm text-ink-600">Woke up in {elapsed}s. You can continue working.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button ref={continueRef} variant="accent" onClick={dismiss}>
                Continue
              </Button>
            </div>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="flex items-center gap-3">
              <ServerOff className="size-10 text-danger-600" aria-hidden />
              <div>
                <h2 id="wake-title" className="font-display text-lg font-extrabold tracking-tight text-ink-950">
                  Still can&apos;t reach the server
                </h2>
                <p className="text-sm text-ink-600">It hasn&apos;t answered for a few minutes.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={dismiss}>
                Dismiss
              </Button>
              <Button variant="primary" onClick={retry}>
                Try again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
