import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { homePathFor } from '@/hooks/useAuth';

/**
 * Route guard.
 *  - roles: restrict to these roles
 *  - requireProfile: send users without a profile to onboarding first
 */
export function RequireAuth({ roles, requireProfile = true }) {
  const { token, user, profile } = useAuthStore();
  const location = useLocation();

  if (!token || !user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (requireProfile && !profile && user.role !== 'admin') {
    return <Navigate to="/onboarding" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    // Must route to somewhere this role is actually allowed, or the redirect target bounces
    // it straight back here — an admin sent to the client-only /dashboard used to loop.
    return <Navigate to={homePathFor(user, profile)} replace />;
  }
  return <Outlet />;
}

/** For login/register: signed-in users skip straight to the app. */
export function GuestOnly() {
  const { token, user, profile } = useAuthStore();
  if (token && user) return <Navigate to={homePathFor(user, profile)} replace />;
  return <Outlet />;
}
