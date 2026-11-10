import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      profile: null,
      // Transient (not persisted): true right after sign-in/sign-up to play the welcome transition
      welcome: false,

      setWelcome: (welcome) => set({ welcome }),
      setSession: ({ token, user, profile }) => set({ token, user, profile: profile ?? null }),
      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      logout: () => set({ token: null, user: null, profile: null }),
    }),
    {
      name: 'worknest-auth',
      partialize: ({ token, user, profile }) => ({ token, user, profile }),
    },
  ),
);

export const useIsAuthenticated = () => useAuthStore((s) => Boolean(s.token));
export const useCurrentUser = () => useAuthStore((s) => s.user);
