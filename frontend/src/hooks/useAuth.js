import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores/authStore';

/** Where a user should land after signing in, based on role and whether their profile exists. */
export function homePathFor(user, profile) {
  if (!user) return '/';
  if (!profile && user.role !== 'admin') return '/onboarding';
  return user.role === 'worker' ? '/jobs' : '/dashboard';
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (session, _vars, _ctx) => {
      setSession(session);
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      navigate(redirect?.startsWith('/') ? redirect : homePathFor(session.user, session.profile), { replace: true });
    },
  });
}

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (session) => {
      setSession(session);
      navigate('/onboarding', { replace: true });
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return () => {
    logout();
    queryClient.clear();
    navigate('/', { replace: true });
  };
}

/** Refreshes user + profile from the server once per session so the persisted copy never goes stale. */
export function useSessionSync() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  return useQuery({
    queryKey: ['me', token],
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await authApi.me();
      setSession({ token, ...data });
      return data;
    },
  });
}
