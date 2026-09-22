import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Briefcase, ChevronDown, LayoutDashboard, LogOut, MessageSquare, PlusCircle, Search, ShieldCheck, Wallet } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { useLogout, useSessionSync } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationBell } from './NotificationBell';
import { Button } from '@/components/ui/Button';
import { Toaster } from '@/components/feedback/Toaster';
import { RealtimeBridge } from '@/realtime/RealtimeBridge';
import { Logo } from './Logo';

function navFor(role) {
  if (role === 'worker') {
    return [
      { to: '/jobs', label: 'Find jobs', icon: Search },
      { to: '/negotiations', label: 'Offers', icon: MessageSquare },
      { to: '/bookings', label: 'Bookings', icon: Briefcase },
      { to: '/earnings', label: 'Earnings', icon: Wallet },
    ];
  }
  if (role === 'client') {
    return [
      { to: '/dashboard', label: 'My jobs', icon: LayoutDashboard },
      { to: '/workers', label: 'Find workers', icon: Search },
      { to: '/negotiations', label: 'Offers', icon: MessageSquare },
      { to: '/bookings', label: 'Bookings', icon: Briefcase },
    ];
  }
  if (role === 'admin') {
    return [
      { to: '/admin', label: 'Admin', icon: ShieldCheck },
      { to: '/workers', label: 'Workers', icon: Search },
      { to: '/bookings', label: 'Bookings', icon: Briefcase },
    ];
  }
  return [
    { to: '/workers', label: 'Find workers', icon: Search },
    { to: '/jobs', label: 'Browse jobs', icon: Briefcase },
  ];
}

function UserMenu({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const logout = useLogout();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors hover:bg-ink-100"
      >
        <Avatar src={user.avatar?.url} name={user.name} size="xs" />
        <span className="hidden max-w-28 truncate text-sm font-semibold text-ink-900 md:inline">{user.name.split(' ')[0]}</span>
        <ChevronDown className={cn('size-3.5 text-ink-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-56 animate-rise overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-raised">
          <div className="border-b border-ink-200 px-3 py-2.5">
            <p className="truncate text-sm font-bold text-ink-950">{user.name}</p>
            <p className="truncate text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{user.role} account</p>
          </div>
          {user.role === 'worker' && (
            <Link role="menuitem" to={`/workers/${user._id}`} className="block px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-950">
              View public profile
            </Link>
          )}
          <Link role="menuitem" to="/profile/edit" className="block px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-950">
            Edit profile
          </Link>
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2 border-t border-ink-200 px-3 py-2 text-left text-sm text-danger-700 hover:bg-danger-50">
            <LogOut className="size-3.5" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  useSessionSync();
  const items = navFor(user?.role);

  return (
    <div className="flex min-h-dvh flex-col">
      {user && <RealtimeBridge />}
      <Toaster />

      <a href="#main" className="sr-only z-50 rounded-md bg-ink-950 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">
          <Logo />

          <nav aria-label="Main" className="hidden flex-1 items-center gap-6 md:flex">
            {items.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/jobs'}
                className={({ isActive }) =>
                  cn(
                    'relative py-4 text-sm font-semibold transition-colors',
                    'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:transition-colors',
                    isActive ? 'text-ink-950 after:bg-primary-500' : 'text-ink-500 after:bg-transparent hover:text-ink-950',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                {user.role === 'client' && (
                  <Button size="sm" to="/jobs/new" className="hidden sm:inline-flex">
                    <PlusCircle className="size-3.5" aria-hidden /> Post a job
                  </Button>
                )}
                <NotificationBell />
                <UserMenu user={user} />
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" to="/login" className="hidden sm:inline-flex">
                  Sign in
                </Button>
                <Button size="sm" to="/register">
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className={cn('flex-1', user && 'pb-16 md:pb-0')}>
        <Outlet />
      </main>

      <footer className="hidden border-t border-ink-200 bg-ink-50 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
          <p className="text-sm text-ink-500">© {new Date().getFullYear()} WorkNest — fair work, fair pay.</p>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-400 uppercase">Stripe test mode · no real payments</p>
        </div>
      </footer>

      {/* Mobile bottom navigation — thumb-reachable, like most marketplace apps */}
      {user && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <ul className="grid grid-cols-4">
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to} className="min-w-0">
                <NavLink
                  to={to}
                  end={to === '/jobs'}
                  className={({ isActive }) =>
                    cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-ink-950' : 'text-ink-400')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn('size-4', isActive && 'text-primary-500')} aria-hidden />
                      <span className="truncate px-1">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
