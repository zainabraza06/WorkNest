import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Loader2 } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { GuestOnly, RequireAuth } from '@/components/layout/RequireAuth';
import LandingPage from '@/pages/LandingPage';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const OnboardingPage = lazy(() => import('@/pages/profile/OnboardingPage'));
const ProfileEditPage = lazy(() => import('@/pages/profile/ProfileEditPage'));
const DiscoverWorkersPage = lazy(() => import('@/pages/workers/DiscoverWorkersPage'));
const WorkerProfilePage = lazy(() => import('@/pages/workers/WorkerProfilePage'));
const BrowseJobsPage = lazy(() => import('@/pages/jobs/BrowseJobsPage'));
const JobDetailPage = lazy(() => import('@/pages/jobs/JobDetailPage'));
const JobPostPage = lazy(() => import('@/pages/jobs/JobPostPage'));
const ClientDashboardPage = lazy(() => import('@/pages/dashboard/ClientDashboardPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function PageFallback() {
  return (
    <div role="status" className="flex min-h-[50dvh] items-center justify-center text-ink-500">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="workers" element={<DiscoverWorkersPage />} />
          <Route path="workers/:userId" element={<WorkerProfilePage />} />
          <Route path="jobs/:id" element={<JobDetailPage />} />

          <Route element={<GuestOnly />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
          </Route>

          <Route element={<RequireAuth requireProfile={false} />}>
            <Route path="onboarding" element={<OnboardingPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="profile/edit" element={<ProfileEditPage />} />
          </Route>

          <Route element={<RequireAuth roles={['client']} />}>
            <Route path="dashboard" element={<ClientDashboardPage />} />
            <Route path="jobs/new" element={<JobPostPage />} />
            <Route path="jobs/:id/edit" element={<JobPostPage />} />
          </Route>

          <Route element={<RequireAuth roles={['worker']} />}>
            <Route path="jobs" element={<BrowseJobsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
