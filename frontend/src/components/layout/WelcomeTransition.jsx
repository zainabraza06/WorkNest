import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { LogoMark } from './Logo';

/**
 * Full-screen hand-off after signing in: the app is already rendering underneath, this
 * overlay plays the logo and fades away to reveal it — the same "unlock" beat native apps use.
 * It never blocks: pointer events pass through and it removes itself on a timer.
 */
export function WelcomeTransition() {
  const welcome = useAuthStore((s) => s.welcome);
  const name = useAuthStore((s) => s.user?.name);
  const setWelcome = useAuthStore((s) => s.setWelcome);

  useEffect(() => {
    if (!welcome) return undefined;
    const t = setTimeout(() => setWelcome(false), 1600);
    return () => clearTimeout(t);
  }, [welcome, setWelcome]);

  if (!welcome) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[100] flex animate-overlay-out flex-col items-center justify-center bg-ink-950"
    >
      <LogoMark animated invert className="size-20 rounded-2xl" />
      <p className="mt-6 animate-rise font-display text-2xl font-extrabold tracking-tight text-white">
        Welcome{name ? `, ${name.split(' ')[0]}` : ''}
      </p>
    </div>
  );
}
