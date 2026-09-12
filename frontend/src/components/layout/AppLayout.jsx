import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Briefcase, ChevronDown, LayoutDashboard, LogOut, MessageSquare, PlusCircle, Search, User } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { useLogout, useSessionSync } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Logo } from './Logo';

function navFor(role) {
  if (role === 'worker') {
    return [
      { to: '/jobs', label: 'Find jobs', icon: Search },
      { to: '/negotiations', label: 'Offers', icon: MessageSquare },
      { to: '/bookings', label: 'Bookings', icon: Briefcase },
      { to: '/profile/edit', label: 'Profile', icon: User },
    ];
  }
  if (role === 'client') {
    return [
      { to: '/dashboard', label: 'My jobs', icon: LayoutDashboard },
      { to: '/workers', label: 'Find workers', icon: Search },
      { to: '/jobs/new', label: 'Post a job', icon: PlusCircle },
      { to: '/negotiations', label: 'Offers', icon: MessageSquare },
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
        className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-ink-100"
      >
        <Avatar src={user.avatar?.url} name={user.name} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium md:inline">{user.name}</span>
        <ChevronDown className="size-4 text-ink-500" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-raised">
          <div className="border-b border-ink-100 px-4 py-2.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-ink-500 capitalize">{user.role} account</p>
          </div>
          {user.role === 'worker' && (
            <Link role="menuitem" to={`/workers/${user._id}`} className="block px-4 py-2 text-sm hover:bg-ink-100">
              View public profile
            </Link>
          )}
          <Link role="menuitem" to="/profile/edit" className="block px-4 py-2 text-sm hover:bg-ink-100">
            Edit profile
          </Link>
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger-700 hover:bg-danger-50">
            <LogOut className="size-4" aria-hidden /> Sign out
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
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Logo />
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {items.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/jobs'}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary-50 text-primary-800' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <UserMenu user={user} />
            ) : (
              <>
                <Button variant="ghost" to="/login" className="hidden sm:inline-flex">
                  Sign in
                </Button>
                <Button to="/register">Get started</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className={cn('flex-1', user && 'pb-20 md:pb-0')}>
        <Outlet />
      </main>

      <footer className="hidden border-t border-ink-200 bg-white md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-ink-500">
          <p>© {new Date().getFullYear()} WorkNest. Fair work, fair pay.</p>
          <p>Payments run in Stripe test mode — no real money is moved.</p>
        </div>
      </footer>

      {/* Mobile bottom navigation — thumb-reachable, like most marketplace apps */}
      {user && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          <ul className="grid grid-cols-4">
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/jobs'}
                  className={({ isActive }) =>
                    cn('flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium', isActive ? 'text-primary-700' : 'text-ink-500')
                  }
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
