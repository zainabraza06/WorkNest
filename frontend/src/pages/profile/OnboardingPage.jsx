import { Navigate, useNavigate } from 'react-router';
import { ClientProfileForm } from '@/components/profile/ClientProfileForm';
import { WorkerProfileForm } from '@/components/profile/WorkerProfileForm';
import { useAuthStore } from '@/stores/authStore';

export default function OnboardingPage() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();

  if (!user) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to={user.role === 'worker' ? '/jobs' : '/dashboard'} replace />;

  const isWorker = user.role === 'worker';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-600 uppercase">Step 2 of 2</p>
      <h1 className="mt-2 text-3xl">{isWorker ? 'Set up your worker profile' : 'Tell us where you are'}</h1>
      <p className="mt-2 mb-6 text-ink-600">
        {isWorker
          ? 'A complete profile helps clients find and trust you. You can add photos and ID verification afterwards.'
          : 'We use your location to show nearby workers and suggest fair local prices.'}
      </p>
      {isWorker ? (
        <WorkerProfileForm submitLabel="Create profile" onSaved={() => navigate('/profile/edit?welcome=1', { replace: true })} />
      ) : (
        <ClientProfileForm submitLabel="Continue" onSaved={() => navigate('/jobs/new', { replace: true })} />
      )}
    </div>
  );
}
