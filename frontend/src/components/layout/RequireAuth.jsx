import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/authStore';

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
    return <Navigate to={user.role === 'worker' ? '/jobs' : '/dashboard'} replace />;
  }
  return <Outlet />;
}

/** For login/register: signed-in users skip straight to the app. */
export function GuestOnly() {
  const { token, user } = useAuthStore();
  if (token && user) return <Navigate to={user.role === 'worker' ? '/jobs' : '/dashboard'} replace />;
  return <Outlet />;
}
