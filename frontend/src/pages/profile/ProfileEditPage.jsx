import { useSearchParams } from 'react-router';
import { ExternalLink } from 'lucide-react';

import { ClientProfileForm } from '@/components/profile/ClientProfileForm';
import { AvatarUploader, IdVerificationCard, PortfolioManager } from '@/components/profile/MediaManagers';
import { WorkerProfileForm } from '@/components/profile/WorkerProfileForm';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/States';
import { useAuthStore } from '@/stores/authStore';

export default function ProfileEditPage() {
  const { user, profile } = useAuthStore();
  const [params] = useSearchParams();
  const isWorker = user.role === 'worker';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">Your profile</h1>
        {isWorker && (
          <Button variant="outline" size="sm" to={`/workers/${user._id}`}>
            <ExternalLink className="size-4" aria-hidden /> View public profile
          </Button>
        )}
      </div>

      {params.get('welcome') && (
        <InlineAlert tone="success">Your profile is live! Add a photo, past work and ID verification to rank higher in search.</InlineAlert>
      )}

      <AvatarUploader />
      {isWorker && (
        <>
          <IdVerificationCard />
          <PortfolioManager />
        </>
      )}

      {/* key forces a fresh form when the stored profile is replaced after save */}
      {isWorker ? <WorkerProfileForm key={profile?.updatedAt} profile={profile} /> : <ClientProfileForm key={profile?.updatedAt} profile={profile} />}
    </div>
  );
}
